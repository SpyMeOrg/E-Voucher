// أنواع البيانات لتبويب سجل التدفق النقدي P2P

// نوع رصيد البنك
export interface BankBalance {
  amount: number;
  currency: string;
  initialRate?: number; // سعر الصرف الأولي (الريت)
}

// نوع العملية من ملف Excel المستورد
export interface P2PTransaction {
  reference: string;
  type: 'Buy' | 'Sell';
  currency: string;
  amount: number;
  realAmount: number;
  usdtBefore: number;
  usdt: number;
  price: number;
  fees: number;
  status: 'COMPLETED' | 'CANCELLED';
  date: string;
  tradeType: string;
  source: string;
}

// نوع معلومات متوسط التكلفة
export interface CurrencyCostInfo {
  totalAmount: number;        // إجمالي مبلغ العملة
  totalCostInBase: number;    // إجمالي التكلفة بالعملة الأساسية
  weightedAvgRate: number;    // متوسط سعر التكلفة المرجح
  initialAmount: number;      // مبلغ رأس المال الأولي
  initialRate: number;        // سعر الصرف الأولي
  acquiredAmount: number;     // المبلغ المكتسب
}

// نوع لسجل التدفق النقدي
export interface CashFlowRecord {
  id: string;
  date: Date;
  type: 'Buy' | 'Sell';
  currency: string;
  amount: number;
  usdt: number;
  price: number;
  balances: {
    [key: string]: number; // رصيد كل عملة
    USDT: number;         // رصيد USDT
  };
  costInfo: {
    [currency: string]: CurrencyCostInfo;  // معلومات متوسط التكلفة لكل عملة
  };
  description: string;
}

// نوع ملخص العمليات
export interface TransactionSummary {
  totalBuy: { [currency: string]: number };
  totalSell: { [currency: string]: number };
  totalBuyUsdt: number;
  totalSellUsdt: number;
  avgBuyPrice: { [currency: string]: number };
  avgSellPrice: { [currency: string]: number };
  currentBalances: { [currency: string]: number };
  currencyCostInfo: { [currency: string]: CurrencyCostInfo };  // معلومات متوسط التكلفة
}

export interface EVoucherSummary {
  totalEGP: number;        // إجمالي المبلغ بالجنيه المصري
  totalAED: number;        // إجمالي المبلغ بالدرهم الإماراتي
  totalUSDT: number;       // إجمالي اليوزد المخصوم
  avgAEDtoEGP: number;     // متوسط سعر الدرهم مقابل الجنيه
  avgUSDTtoEGP: number;    // متوسط سعر اليوزد مقابل الجنيه
} 