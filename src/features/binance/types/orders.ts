interface BaseOrder {
    orderId: string;          // orderNumber من API
    type: 'BUY' | 'SELL';     // tradeType من API
    fiatAmount: number;       // totalPrice من API (المبلغ بالجنيه)
    fiatCurrency: string;     // نوع العملة (EGP, AED, etc.)
    price: number;           // unitPrice من API (سعر الوحدة)
    cryptoAmount: number;     // amount من API (الكمية بال USDT)
    fee: number;             // commission من API
    netAmount: number;       // الكمية بعد خصم الرسوم (Release/Receive)
    actualUsdt: number;      // اليوزد الفعلي بعد حساب الرسوم
    status: 'COMPLETED' | 'CANCELLED' | 'PENDING';  // orderStatus من API
    createTime: number;      // createTime من API
}

// نستخدم نفس الـ interface للشراء والبيع لأن البيانات متشابهة
export type BinanceOrder = BaseOrder;

export interface BinanceCredentials {
    apiKey: string;
    secretKey: string;
}

// واجهة جديدة لتخزين بيانات الاعتماد مع الاسم
export interface SavedCredential {
    name: string;
    apiKey: string;
    secretKey: string;
}
