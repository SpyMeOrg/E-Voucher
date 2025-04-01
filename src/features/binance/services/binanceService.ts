import { BinanceOrder } from '../types/orders';

declare global {
    interface Window {
        CryptoJS: any;
    }
}

export interface P2POrderParams {
    startTime?: number;
    endTime?: number;
    page?: number;
    rows?: number;
    tradeType?: string;  // 'BUY' | 'SELL'
}

export class BinanceService {
    private apiKey: string;
    private secretKey: string;
    private recvWindow = 60000;
    private maxRetries = 3;
    private retryDelay = 1000;
    private baseUrl: string;

    constructor(apiKey: string, secretKey: string) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        // تحديث العنوان بناءً على بيئة التشغيل
        this.baseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/.netlify/functions/binanceApi'
            : `${window.location.origin}/.netlify/functions/binanceApi`;
    }

    private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error as Error;
                if (error instanceof Error && 
                    (error.message.includes('restricted location') || 
                     error.message.includes('API-key invalid'))) {
                    // لا نحاول مرة أخرى في حالة أخطاء معينة
                    throw error;
                }
                // انتظر قبل المحاولة التالية
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
            }
        }
        
        throw lastError || new Error('Maximum retry attempts reached');
    }

    private async makeRequest(endpoint: string, params: Record<string, string> = {}) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            credentials: 'include',
            mode: 'cors',
            body: JSON.stringify({
                apiKey: this.apiKey,
                secretKey: this.secretKey,
                endpoint,
                params
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('API Error Response:', text);
            throw new Error(`خطأ في الاتصال: ${response.status}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse response:', text);
            throw new Error('تنسيق الاستجابة غير صالح');
        }
    }

    async checkServerTime(): Promise<number> {
        return this.retryRequest(async () => {
            try {
                console.log('Checking server time...');
                const data = await this.makeRequest('/api/v3/time');
                
                if (!data || typeof data.serverTime !== 'number') {
                    console.error('Invalid server time format:', data);
                    throw new Error('تنسيق وقت السيرفر غير صالح');
                }

                return data.serverTime;
            } catch (error) {
                console.error('Error in checkServerTime:', error);
                throw error;
            }
        });
    }

    private async validateTimestamp(timestamp: number): Promise<boolean> {
        try {
            const serverTime = await this.checkServerTime();
            const diff = Math.abs(serverTime - timestamp);
            const isValid = diff <= this.recvWindow;
            console.log('Timestamp validation:', {
                serverTime,
                localTime: timestamp,
                difference: diff,
                recvWindow: this.recvWindow,
                isValid
            });
            return isValid;
        } catch (error) {
            console.error('Error validating timestamp:', error);
            return true; // نسمح بالمتابعة في حالة الخطأ
        }
    }

    async getP2POrders(params: P2POrderParams = {}) {
        return this.retryRequest(async () => {
            try {
                console.log('Fetching P2P orders with params:', params);
                const timestamp = Date.now();
                await this.validateTimestamp(timestamp);

                const requestParams: Record<string, string> = {
                    timestamp: timestamp.toString(),
                    recvWindow: this.recvWindow.toString()
                };
                
                if (params.startTime) {
                    requestParams.startTimestamp = params.startTime.toString();
                }
                
                if (params.endTime) {
                    requestParams.endTimestamp = params.endTime.toString();
                }
                
                if (params.page) {
                    requestParams.page = params.page.toString();
                }
                
                if (params.rows) {
                    requestParams.rows = params.rows.toString();
                }
                
                if (params.tradeType) {
                    requestParams.tradeType = params.tradeType;
                }

                console.log('Making P2P orders request with params:', requestParams);
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    credentials: 'include',
                    mode: 'cors',
                    body: JSON.stringify({
                        apiKey: this.apiKey,
                        secretKey: this.secretKey,
                        endpoint: '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
                        params: requestParams
                    }),
                });

                console.log('P2P orders response status:', response.status);
                const data = await response.json();
                console.log('P2P orders response:', data);

                if (!response.ok) {
                    const error = data.error || 'خطأ في جلب الأوردرات';
                    console.error('P2P orders error:', error);
                    throw new Error(error);
                }

                if (!data || !data.data || !Array.isArray(data.data)) {
                    console.error('Invalid P2P orders format:', data);
                    throw new Error('تنسيق البيانات المستلمة غير صالح');
                }

                const transformedOrders = this.transformOrders(data.data);
                console.log('Transformed orders:', transformedOrders);
                return transformedOrders;

            } catch (error) {
                console.error('Error in getP2POrders:', error);
                throw error;
            }
        });
    }

    private transformOrders(data: any[]): BinanceOrder[] {
        return data.map(order => {
            const cryptoAmount = this.parseNumber(order.amount);
            const isTakerOrder = order.commission === 0;
            const fee = isTakerOrder ? 0.05 : this.parseNumber(order.commission);
            
            let actualUsdt = cryptoAmount;
            
            if (isTakerOrder) {
                if (order.tradeType === 'BUY') {
                    actualUsdt = cryptoAmount - 0.05;
                } else {
                    actualUsdt = cryptoAmount + 0.05;
                }
            } else {
                if (order.tradeType === 'BUY') {
                    actualUsdt = cryptoAmount - fee;
                } else {
                    actualUsdt = cryptoAmount + fee;
                }
            }

            const transformedOrder: BinanceOrder = {
                orderId: order.orderNumber,
                type: order.tradeType as 'BUY' | 'SELL',
                fiatAmount: this.parseNumber(order.totalPrice),
                fiatCurrency: order.fiat || 'UNKNOWN',
                price: this.parseNumber(order.unitPrice),
                cryptoAmount: cryptoAmount,
                fee: fee,
                netAmount: cryptoAmount,
                actualUsdt: actualUsdt,
                status: this.mapOrderStatus(order.orderStatus),
                createTime: order.createTime
            };
            return transformedOrder;
        });
    }

    private parseNumber(value: any): number {
        if (value === undefined || value === null) {
            throw new Error('القيمة غير موجودة');
        }
        
        const strValue = value.toString().trim();
        const cleanValue = strValue.replace(/[^0-9.-]/g, '');
        const num = Number(cleanValue);
        
        if (isNaN(num)) {
            throw new Error('القيمة ليست رقماً صالحاً');
        }
        
        return num === 0 ? 0 : num || 0;
    }

    private mapOrderStatus(status: string): 'COMPLETED' | 'CANCELLED' | 'PENDING' {
        if (!status) return 'PENDING';
        
        const normalizedStatus = status.toString().toUpperCase();
        
        if (normalizedStatus.includes('COMPLET') || normalizedStatus.includes('SUCCESS')) {
            return 'COMPLETED';
        }
        if (normalizedStatus.includes('CANCEL') || normalizedStatus.includes('FAIL')) {
            return 'CANCELLED';
        }
        return 'PENDING';
    }
}
