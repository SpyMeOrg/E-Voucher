export interface PriceEntry {
    amount: number;        // المبلغ بالجنيه
    usdtAmount: number;    // كمية اليوزد
    price: number;         // السعر (يتم حسابه تلقائياً)
}

export interface PriceSummary {
    totalAmount: number;    // إجمالي المبلغ بالجنيه
    totalUsdt: number;      // إجمالي كمية اليوزد
    averagePrice: number;   // متوسط السعر
} 