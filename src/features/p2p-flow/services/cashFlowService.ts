import { read, utils, WorkBook } from 'xlsx';
import { P2PTransaction, CashFlowRecord, TransactionSummary } from '../types/types';

// تعريف نوع CurrencyCostInfo
interface CurrencyCostInfo {
  totalAmount: number;
  totalCostInBase: number;
  weightedAvgRate: number;
  initialAmount: number;
  initialRate: number;
  acquiredAmount: number;
}

// استيراد ملف Excel وتحويله إلى مصفوفة عمليات
export const importExcelFile = async (file: File): Promise<P2PTransaction[]> => {
  try {
    const data = await file.arrayBuffer();
    const workbook = read(data);
    
    if (!workbook.SheetNames.length) {
      throw new Error('الملف لا يحتوي على أي بيانات');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = utils.sheet_to_json<any>(worksheet);
    
    if (!jsonData.length) {
      throw new Error('لا توجد بيانات في الملف');
    }

    // تحويل البيانات إلى النوع المطلوب
    const transactions: P2PTransaction[] = jsonData
      .filter(row => row.Status !== 'CANCELLED') // تجاهل العمليات الملغاة
      .map(row => ({
        reference: row.Reference || '',
        type: row.Type || '',
        currency: row.Currency || '',
        amount: parseFloat(row.Amount || 0),
        realAmount: parseFloat(row.RealAmount || row.Amount || 0),
        usdtBefore: parseFloat(row.UsdtB || 0),
        usdt: parseFloat(row.USDT || 0),
        price: parseFloat(row.Price || 0),
        fees: parseFloat(row.Fees || 0),
        status: row.Status || 'COMPLETED',
        date: row.Date || '',
        tradeType: row.Type || '',
        source: row.Source || ''
      }))
      // تصفية إضافية للبيانات غير الصالحة
      .filter(transaction => {
        const isValidDate = transaction.date && !isNaN(new Date(transaction.date).getTime());
        const hasValidValues = transaction.usdt > 0 || transaction.realAmount > 0;
        return isValidDate && hasValidValues && (transaction.type === 'Buy' || transaction.type === 'Sell');
      });

    // ترتيب العمليات حسب التاريخ
    transactions.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    return transactions;
  } catch (error) {
    console.error('خطأ في استيراد الملف:', error);
    throw error;
  }
};

// إنشاء سجل التدفق النقدي من العمليات
export const createCashFlowRecords = (
  transactions: P2PTransaction[],
  initialBalances: { [currency: string]: number; USDT: number },
  initialRates: { [currency: string]: number } = {} // معدلات صرف رأس المال الأولي
): CashFlowRecord[] => {
  const records: CashFlowRecord[] = [];
  const currentBalances = { ...initialBalances };
  
  // معلومات متوسط التكلفة
  let costInfo: { [currency: string]: CurrencyCostInfo } = {};
  
  // تهيئة معلومات متوسط التكلفة
  Object.keys(initialBalances).forEach(currency => {
    // القيمة الافتراضية لمعدل الصرف هي 3.67 لليوزد و 1 لباقي العملات
    const initialRate = initialRates[currency] || (currency === 'USDT' ? 3.67 : 1);
    costInfo[currency] = {
      totalAmount: initialBalances[currency] || 0,
      totalCostInBase: (initialBalances[currency] || 0) * initialRate,
      weightedAvgRate: initialRate,
      initialAmount: initialBalances[currency] || 0,
      initialRate: initialRate,
      acquiredAmount: 0
    };
  });

  // التأكد من وجود قيم بدائية لجميع العملات المستخدمة في العمليات
  transactions.forEach(transaction => {
    if (!currentBalances[transaction.currency]) {
      currentBalances[transaction.currency] = 0;
    }
    
    // التأكد من وجود معلومات متوسط التكلفة للعملة
    if (!costInfo[transaction.currency]) {
      costInfo[transaction.currency] = {
        totalAmount: 0,
        totalCostInBase: 0,
        weightedAvgRate: initialRates[transaction.currency] || (transaction.currency === 'USDT' ? 3.67 : 1),
        initialAmount: 0,
        initialRate: initialRates[transaction.currency] || (transaction.currency === 'USDT' ? 3.67 : 1),
        acquiredAmount: 0
      };
    }
    
    // التأكد من وجود معلومات متوسط التكلفة لليوزد
    if (!costInfo['USDT']) {
      costInfo['USDT'] = {
        totalAmount: initialBalances['USDT'] || 0,
        totalCostInBase: (initialBalances['USDT'] || 0) * (initialRates['USDT'] || 3.67),
        weightedAvgRate: initialRates['USDT'] || 3.67,
        initialAmount: initialBalances['USDT'] || 0,
        initialRate: initialRates['USDT'] || 3.67,
        acquiredAmount: 0
      };
    }
  });

  transactions.forEach(transaction => {
    // تخطي العمليات غير الصالحة
    if (!transaction.date || isNaN(new Date(transaction.date).getTime())) {
      return;
    }
    if (!transaction.type || (transaction.type !== 'Buy' && transaction.type !== 'Sell')) {
      return;
    }
    if (transaction.usdt <= 0 && transaction.realAmount <= 0) {
      return;
    }

    // نسخة من معلومات متوسط التكلفة لتحديثها
    const updatedCostInfo = { ...costInfo };

    // تحديث الأرصدة ومعلومات متوسط التكلفة بناءً على نوع العملية
    if (transaction.type === 'Buy') {
      // شراء USDT: نقص من العملة المحلية، زيادة في USDT
      currentBalances[transaction.currency] -= transaction.realAmount;
      currentBalances.USDT += transaction.usdt;
      
      // تحديث معلومات متوسط التكلفة للعملة المحلية
      const currencyCostInfo = { ...updatedCostInfo[transaction.currency] };
      currencyCostInfo.totalAmount -= transaction.realAmount;
      
      // تحسين حساب التكلفة الإجمالية للعملة المحلية
      // نحافظ على نسبة التكلفة بين المبلغ الأولي والمبلغ المتبقي
      if (currencyCostInfo.totalAmount < currencyCostInfo.initialAmount) {
        // إذا كان المبلغ المتبقي أقل من المبلغ الأولي، نقلل قيمة المبلغ الأصلي
        currencyCostInfo.initialAmount = currencyCostInfo.totalAmount;
      }
      
      currencyCostInfo.totalCostInBase = currencyCostInfo.initialAmount * currencyCostInfo.initialRate;
      updatedCostInfo[transaction.currency] = currencyCostInfo;
      
      // تحديث معلومات متوسط التكلفة لليوزد
      const usdtCostInfo = { ...updatedCostInfo['USDT'] };
      
      // القيم السابقة
      const prevTotalCost = usdtCostInfo.totalCostInBase;
      
      // القيم الجديدة
      usdtCostInfo.totalAmount += transaction.usdt;
      usdtCostInfo.acquiredAmount += transaction.usdt;
      
      // حساب التكلفة الإجمالية الجديدة (التكلفة السابقة + تكلفة الشراء الجديد)
      const newPurchaseCost = transaction.realAmount;
      usdtCostInfo.totalCostInBase = prevTotalCost + newPurchaseCost;
      
      // حساب متوسط سعر التكلفة المرجح الجديد
      if (usdtCostInfo.totalAmount > 0) {
        usdtCostInfo.weightedAvgRate = usdtCostInfo.totalCostInBase / usdtCostInfo.totalAmount;
      }
      
      updatedCostInfo['USDT'] = usdtCostInfo;
    } else if (transaction.type === 'Sell') {
      // بيع USDT: زيادة في العملة المحلية، نقص من USDT
      currentBalances[transaction.currency] += transaction.realAmount;
      currentBalances.USDT -= transaction.usdt;
      
      // تحديث معلومات متوسط التكلفة للعملة المحلية
      const currencyCostInfo = { ...updatedCostInfo[transaction.currency] };
      currencyCostInfo.totalAmount += transaction.realAmount;
      currencyCostInfo.acquiredAmount += transaction.realAmount;
      
      // تحديث التكلفة الإجمالية للعملة المحلية بناءً على البيع الجديد
      // نستخدم متوسط سعر التكلفة الحالي لليوزد
      const usdtCostRate = updatedCostInfo['USDT']?.weightedAvgRate || transaction.price;
      
      currencyCostInfo.totalCostInBase = (currencyCostInfo.initialAmount * currencyCostInfo.initialRate) +
                                       (currencyCostInfo.acquiredAmount * transaction.price);
                                        
      if (currencyCostInfo.totalAmount > 0) {
        currencyCostInfo.weightedAvgRate = currencyCostInfo.totalCostInBase / currencyCostInfo.totalAmount;
      }
      
      updatedCostInfo[transaction.currency] = currencyCostInfo;
      
      // تحديث معلومات متوسط التكلفة لليوزد
      const usdtCostInfo = { ...updatedCostInfo['USDT'] };
      
      // خفض رصيد اليوزد
      usdtCostInfo.totalAmount -= transaction.usdt;
      
      // تحديث التكلفة الإجمالية لليوزد المتبقي
      if (usdtCostInfo.totalAmount >= usdtCostInfo.initialAmount) {
        // إذا كانت الكمية المتبقية أكبر من أو تساوي الكمية الأصلية، لا تغيير على التكلفة الأصلية
        usdtCostInfo.totalCostInBase = (usdtCostInfo.initialAmount * usdtCostInfo.initialRate) +
                                      ((usdtCostInfo.totalAmount - usdtCostInfo.initialAmount) * usdtCostInfo.weightedAvgRate);
      } else {
        // إذا كانت الكمية المتبقية أقل من الكمية الأصلية، نقلل قيمة التكلفة الأصلية
        usdtCostInfo.initialAmount = usdtCostInfo.totalAmount;
        usdtCostInfo.totalCostInBase = usdtCostInfo.initialAmount * usdtCostInfo.initialRate;
      }
      
      updatedCostInfo['USDT'] = usdtCostInfo;
    }

    // إنشاء وصف للعملية
    const description = transaction.type === 'Buy'
      ? `شراء ${transaction.usdt.toFixed(2)} USDT مقابل ${transaction.realAmount.toFixed(2)} ${transaction.currency}`
      : `بيع ${transaction.usdt.toFixed(2)} USDT مقابل ${transaction.realAmount.toFixed(2)} ${transaction.currency}`;

    // تحديث معلومات متوسط التكلفة
    costInfo = { ...updatedCostInfo };

    // إنشاء سجل جديد
    const record: CashFlowRecord = {
      id: transaction.reference || `transaction-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: new Date(transaction.date),
      type: transaction.type as 'Buy' | 'Sell',
      currency: transaction.currency,
      amount: transaction.realAmount,
      usdt: transaction.usdt,
      price: transaction.price,
      balances: { ...currentBalances },
      costInfo: { ...costInfo },
      description
    };

    records.push(record);
  });

  return records;
};

// حساب ملخص العمليات
export const calculateTransactionSummary = (records: CashFlowRecord[]): TransactionSummary => {
  const summary: TransactionSummary = {
    totalBuy: {},
    totalSell: {},
    totalBuyUsdt: 0,
    totalSellUsdt: 0,
    avgBuyPrice: {},
    avgSellPrice: {},
    currentBalances: {},
    currencyCostInfo: {}
  };

  // تجميع بيانات العمليات
  records.forEach(record => {
    const { currency, type, amount, usdt, balances, costInfo } = record;

    // تحديث إجماليات الشراء والبيع
    if (type === 'Buy') {
      summary.totalBuy[currency] = (summary.totalBuy[currency] || 0) + amount;
      summary.totalBuyUsdt += usdt;
    } else {
      summary.totalSell[currency] = (summary.totalSell[currency] || 0) + amount;
      summary.totalSellUsdt += usdt;
    }

    // تحديث الأرصدة الحالية ومعلومات متوسط التكلفة
    summary.currentBalances = { ...balances };
    summary.currencyCostInfo = { ...costInfo };
  });

  // حساب متوسط الأسعار
  Object.keys(summary.totalBuy).forEach(currency => {
    if (summary.totalBuyUsdt > 0) {
      summary.avgBuyPrice[currency] = summary.totalBuy[currency] / summary.totalBuyUsdt;
    }
  });

  Object.keys(summary.totalSell).forEach(currency => {
    if (summary.totalSellUsdt > 0) {
      summary.avgSellPrice[currency] = summary.totalSell[currency] / summary.totalSellUsdt;
    }
  });

  return summary;
};

// تصدير سجل التدفق النقدي إلى Excel
export const exportCashFlowToExcel = (records: CashFlowRecord[]): WorkBook => {
  // تحويل السجلات إلى تنسيق مناسب للتصدير
  const exportData = records.map(record => {
    // استخراج أرصدة العملات
    const balancesData = Object.entries(record.balances)
      .reduce((acc, [currency, balance]) => {
        acc[`Balance ${currency}`] = balance.toFixed(4);
        return acc;
      }, {} as { [key: string]: string });

    return {
      'Date': record.date.toLocaleString('en-US'),
      'Type': record.type === 'Buy' ? 'Buy' : 'Sell',
      'Currency': record.currency,
      'Amount': record.amount.toFixed(4),
      'USDT Amount': record.usdt.toFixed(4),
      'Price': record.price.toFixed(4),
      'Description': record.type === 'Buy' 
        ? `Buy ${record.usdt.toFixed(4)} USDT for ${record.amount.toFixed(4)} ${record.currency}`
        : `Sell ${record.usdt.toFixed(4)} USDT for ${record.amount.toFixed(4)} ${record.currency}`,
      ...balancesData
    };
  });

  // إنشاء ورقة عمل جديدة
  const worksheet = utils.json_to_sheet(exportData);
  
  // إنشاء كتاب عمل جديد وإضافة ورقة العمل إليه
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Cash Flow Records');
  
  return workbook;
}; 