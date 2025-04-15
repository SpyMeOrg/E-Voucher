import { EVoucherSummary } from '../types/types';
import { read, utils } from 'xlsx';

// وظيفة مساعدة لقراءة ملف Excel
export const readExcelFile = async (file: File): Promise<any[]> => {
  try {
    // قراءة الملف كـ ArrayBuffer
    const data = await file.arrayBuffer();
    
    // استخدام read مباشرة بدلاً من utils.read
    const workbook = read(data, { type: 'array' });
    
    if (!workbook.SheetNames.length) {
      throw new Error('الملف لا يحتوي على أي بيانات');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = utils.sheet_to_json<any>(worksheet);
    
    return jsonData;
  } catch (error) {
    console.error('خطأ في قراءة ملف Excel:', error);
    throw error;
  }
};

export const calculateEVoucherSummary = (transactions: any[]): EVoucherSummary => {
  console.log('Starting E-Voucher calculations with', transactions.length, 'rows');
  
  // استخراج عينة من البيانات
  if (transactions.length > 0) {
    console.log('Sample columns for E-Voucher detection:', Object.keys(transactions[0]));
  }
  
  // فلترة عمليات E-Voucher بطريقة أكثر دقة
  const eVoucherTransactions = transactions.filter(tx => {
    // البحث عن الحقول الرئيسية
    const getFieldValue = (possibleNames: string[]): string => {
      for (const name of possibleNames) {
        if (tx[name] !== undefined) {
          return String(tx[name]).toLowerCase();
        }
      }
      return '';
    };
    
    // استخراج قيم الحقول الرئيسية
    const tradeType = getFieldValue(['Trade Type', 'نوع التداول', 'TradeType']);
    const status = getFieldValue(['Status', 'الحالة', 'حالة']);
    
    // التحقق من أن العملية هي E-Voucher
    const isEVoucher = 
      tradeType.includes('e-voucher') || 
      tradeType.includes('evoucher') || 
      tradeType.includes('فاوتشر');
    
    // التحقق من أن العملية ليست ملغاة
    const isNotCancelled = !status.includes('cancel') && 
                          !status.includes('ملغي') && 
                          !status.includes('ملغاة');
    
    // قبول فقط عمليات E-Voucher غير الملغاة
    return isEVoucher && isNotCancelled;
  });

  console.log(`Found ${eVoucherTransactions.length} valid E-Voucher transactions`);
  
  // عرض عينة من البيانات التي تم العثور عليها
  if (eVoucherTransactions.length > 0) {
    console.log('Sample E-Voucher transaction:', eVoucherTransactions[0]);
  }

  let totalEGP = 0;
  let totalAED = 0;
  let totalUSDT = 0;

  // حساب الإجماليات بطريقة أكثر مرونة
  eVoucherTransactions.forEach((tx, index) => {
    console.log(`Processing E-Voucher transaction ${index}:`, tx);
    
    let foundEGP = false;
    let foundAED = false;
    let foundUSDT = false;
    
    // استخراج قيمة USDT من الحقل الرئيسي فقط لتجنب العد المزدوج
    // نستخدم حقل USDT فقط وليس Usdt B
    if (tx.USDT !== undefined && !isNaN(parseFloat(String(tx.USDT)))) {
      const usdtAmount = parseFloat(String(tx.USDT));
      if (usdtAmount > 0) {
        totalUSDT += usdtAmount;
        foundUSDT = true;
        console.log(`Using primary USDT field: ${usdtAmount}`);
      }
    } else {
      // فحص جميع الحقول للبحث عن USDT إذا لم نجد الحقل الرئيسي
      let bestUsdtField = '';
      let bestUsdtValue = 0;
      
      Object.entries(tx).forEach(([key, value]) => {
        const keyLower = key.toLowerCase();
        const valueStr = String(value);
        
        // تجاهل حقل Usdt B لتجنب العد المزدوج
        if (keyLower === 'usdt b' || key === 'Usdt B' || key === 'UsdtB') {
          console.log(`Skipping Usdt B field to avoid double counting: ${value}`);
          return;
        }
        
        // البحث عن قيم USDT
        if (keyLower.includes('usdt') || 
            keyLower.includes('يوزد') ||
            (valueStr.includes('USDT') && !isNaN(parseFloat(valueStr)))) {
          const amount = parseFloat(valueStr.replace(/[^\d.-]/g, ''));
          if (!isNaN(amount) && amount > 0) {
            if (!bestUsdtField || key === 'USDT') {
              bestUsdtField = key;
              bestUsdtValue = amount;
            }
          }
        }
      });
      
      if (bestUsdtField) {
        totalUSDT += bestUsdtValue;
        foundUSDT = true;
        console.log(`Found USDT amount: ${bestUsdtValue} in field ${bestUsdtField}`);
      }
    }
    
    // فحص جميع الحقول للعثور على قيم EGP و AED
    Object.entries(tx).forEach(([key, value]) => {
      const keyLower = key.toLowerCase();
      const valueStr = String(value);
      
      // البحث عن قيم EGP
      if (
        (keyLower.includes('real') && keyLower.includes('amount')) ||
        keyLower.includes('egp') ||
        keyLower.includes('جنيه') ||
        keyLower.includes('مصري') ||
        (valueStr.includes('EGP') && !isNaN(parseFloat(valueStr)))
      ) {
        const amount = parseFloat(valueStr.replace(/[^\d.-]/g, ''));
        if (!isNaN(amount) && amount > 0) {
          totalEGP += amount;
          foundEGP = true;
          console.log(`Found EGP amount: ${amount} in field ${key}`);
        }
      }
      
      // البحث عن قيم AED
      if (
        (!keyLower.includes('real') && keyLower.includes('amount') && keyLower !== 'real amount') ||
        keyLower.includes('aed') ||
        keyLower.includes('درهم') ||
        keyLower.includes('إماراتي') ||
        (valueStr.includes('AED') && !isNaN(parseFloat(valueStr)))
      ) {
        const amount = parseFloat(valueStr.replace(/[^\d.-]/g, ''));
        if (!isNaN(amount) && amount > 0) {
          totalAED += amount;
          foundAED = true;
          console.log(`Found AED amount: ${amount} in field ${key}`);
        }
      }
    });
    
    // إذا لم يتم العثور على قيم EGP أو AED أو USDT، حاول استخراج القيم من الحقول العامة
    if (!foundEGP && !foundAED && !foundUSDT) {
      const generalAmountField = Object.keys(tx).find(key => 
        key.toLowerCase().includes('amount') && 
        !key.toLowerCase().includes('real')
      );
      
      if (generalAmountField) {
        const amount = parseFloat(String(tx[generalAmountField]).replace(/[^\d.-]/g, ''));
        if (!isNaN(amount) && amount > 0) {
          // تحديد نوع العملة
          const currencyField = Object.keys(tx).find(key => 
            key.toLowerCase().includes('currency') || 
            key.toLowerCase().includes('عملة')
          );
          
          const currency = currencyField ? String(tx[currencyField]).toUpperCase() : '';
          
          if (currency.includes('EGP')) {
            totalEGP += amount;
            console.log(`Found EGP amount from general field: ${amount}`);
          } else if (currency.includes('AED')) {
            totalAED += amount;
            console.log(`Found AED amount from general field: ${amount}`);
          } else if (currency.includes('USDT')) {
            totalUSDT += amount;
            console.log(`Found USDT amount from general field: ${amount}`);
          }
        }
      }
    }
  });

  console.log('Calculated totals:', { totalEGP, totalAED, totalUSDT });

  // حساب المتوسطات
  const avgAEDtoEGP = totalAED > 0 ? totalEGP / totalAED : 0;
  const avgUSDTtoEGP = totalUSDT > 0 ? totalEGP / totalUSDT : 0;

  console.log('Calculated average rates:', { avgAEDtoEGP, avgUSDTtoEGP });

  return {
    totalEGP,
    totalAED,
    totalUSDT,
    avgAEDtoEGP,
    avgUSDTtoEGP
  };
}; 