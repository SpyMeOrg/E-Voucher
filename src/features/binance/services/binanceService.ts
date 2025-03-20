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
    private baseUrl: string;

    constructor(apiKey: string, secretKey: string) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        // تحديد العنوان بناءً على بيئة التشغيل
        this.baseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:9999/.netlify/functions/binanceApi'
            : '/.netlify/functions/binanceApi';
    }

    async checkServerTime(): Promise<number> {
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    secretKey: this.secretKey,
                    endpoint: '/api/v3/time'
                }),
            });

            const responseText = await response.text();
            console.log('Raw server time response:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Error parsing server time response:', parseError);
                throw new Error('استجابة غير صالحة من السيرفر');
            }

            if (!response.ok) {
                throw new Error(data.error || data.msg || `خطأ في الاتصال: ${response.status}`);
            }

            if (!data.serverTime) {
                console.error('Unexpected response format:', data);
                throw new Error('تنسيق استجابة غير متوقع من السيرفر');
            }

            return data.serverTime;
        } catch (error) {
            console.error('خطأ في الحصول على وقت السيرفر:', error);
            throw error;
        }
    }

    private async validateTimestamp(timestamp: number): Promise<boolean> {
        try {
            const serverTime = await this.checkServerTime();
            const diff = Math.abs(serverTime - timestamp);
            return diff <= this.recvWindow;
        } catch {
            return true;
        }
    }

    async getP2POrders(params: P2POrderParams = {}) {
        try {
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

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    secretKey: this.secretKey,
                    endpoint: '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
                    params: requestParams
                }),
            });

            const responseText = await response.text();
            console.log('Raw P2P orders response:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Error parsing P2P orders response:', parseError);
                throw new Error('استجابة غير صالحة من السيرفر');
            }

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('تم تجاوز حد الطلبات المسموح به');
                } else if (response.status === 418) {
                    throw new Error('تم حظر عنوان IP الخاص بك');
                }
                throw new Error(data.error || data.msg || 'خطأ في جلب الأوردرات');
            }

            console.log('Parsed P2P orders response:', data);

            if (!data || !Array.isArray(data.data)) {
                console.error('شكل البيانات غير صحيح:', data);
                throw new Error('البيانات المستلمة غير صالحة');
            }

            return this.transformOrders(data.data);

        } catch (error) {
            console.error('خطأ في getP2POrders:', error);
            throw error;
        }
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
