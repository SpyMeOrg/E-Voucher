import { read, utils, WorkBook } from 'xlsx';
import { P2PTransaction, CashFlowRecord, TransactionSummary, CurrencyCostInfo } from '../types/types';

// استيراد ملف Excel وتحويله إلى مصفوفة عمليات
export const importExcelFile = async (file: File, returnAllTransactions = false): Promise<P2PTransaction[]> => {
  try {
    console.log('بدء قراءة الملف:', file.name);
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

    console.log(`تم استخراج ${jsonData.length} صف من الملف`);
    
    // تحديد أسماء الأعمدة المتاحة
    const availableColumns = Object.keys(jsonData[0] || {});
    console.log('الأعمدة المتاحة:', availableColumns);
    
    // للتشخيص - نطبع البيانات الأولية للتأكد من أنها تُقرأ بشكل صحيح
    if (jsonData.length > 0) {
      console.log('نموذج للبيانات المستوردة:');
      console.log('الصف 1:', JSON.stringify(jsonData[0]));
      if (jsonData.length > 1) console.log('الصف 2:', JSON.stringify(jsonData[1]));
    }

    let allTransactions: P2PTransaction[] = [];
    let p2pTransactionsCount = 0;
    let evoucherTransactionsCount = 0;
    let finalFilteredTransactions: P2PTransaction[] = [];

    // تنفيذ استراتيجية اكتشاف أسماء الأعمدة المختلفة
    const findColumnName = (possibleNames: string[]): string | null => {
      for (const name of possibleNames) {
        if (availableColumns.includes(name)) {
          return name;
        }
        // محاولة البحث بدون حساسية لحالة الأحرف
        const lowerCaseName = name.toLowerCase();
        const match = availableColumns.find(col => col.toLowerCase() === lowerCaseName);
        if (match) {
          return match;
        }
      }
      return null;
    };

    // تحديد أسماء الأعمدة الفعلية في الملف
    const typeColumn = findColumnName(['Type', 'نوع', 'نوع العملية', 'Transaction Type']) || 'Type';
    const currencyColumn = findColumnName(['Currency', 'عملة', 'العملة']) || 'Currency';
    const amountColumn = findColumnName(['Amount', 'المبلغ', 'المبلغ الكلي', 'Total Amount']) || 'Amount';
    const realAmountColumn = findColumnName(['RealAmount', 'Real Amount', 'المبلغ الفعلي', 'Actual Amount']) || amountColumn;
    const usdtColumn = findColumnName(['USDT', 'يوزد', 'USDTAmount', 'USDT Amount']) || 'USDT';
    const usdtBeforeColumn = findColumnName(['UsdtB', 'Usdt Before', 'USDT Before']) || 'UsdtB';
    const priceColumn = findColumnName(['Price', 'السعر', 'Rate', 'Exchange Rate']) || 'Price';
    const feesColumn = findColumnName(['Fees', 'Fee', 'الرسوم', 'العمولة']) || 'Fees';
    const statusColumn = findColumnName(['Status', 'الحالة', 'Transaction Status']) || 'Status';
    const dateColumn = findColumnName(['Date', 'تاريخ', 'التاريخ', 'Transaction Date']) || 'Date';
    const tradeTypeColumn = findColumnName(['TradeType', 'Trade Type', 'نوع التداول', 'Transaction Category']) || 'TradeType';
    const sourceColumn = findColumnName(['Source', 'المصدر', 'Platform', 'منصة']) || 'Source';
    
    console.log('أسماء الأعمدة المكتشفة:', {
      typeColumn, currencyColumn, amountColumn, realAmountColumn, usdtColumn,
      priceColumn, feesColumn, statusColumn, dateColumn, tradeTypeColumn, sourceColumn
    });

    // تحويل البيانات إلى النوع المطلوب مع التخمين الذكي للبيانات المفقودة
    allTransactions = jsonData
      .filter(row => {
        // تجاهل الصفوف الفارغة فقط
        if (!row || Object.keys(row).length === 0) {
          console.log('تجاهل صف فارغ');
          return false;
        }
        return true;
      })
      .map((row, index) => {
        // تسجيل البيانات المستخرجة للتشخيص
        console.log(`معالجة الصف ${index}:`, JSON.stringify(row));
        
        // استخراج البيانات من الأعمدة المحددة
        let rawType = row[typeColumn] || '';
        const currency = row[currencyColumn] || 'AED'; // افتراض AED إذا كان فارغاً
        const amount = parseFloat(row[amountColumn] || 0);
        const realAmount = parseFloat(row[realAmountColumn] || row[amountColumn] || 0);
        const usdt = parseFloat(row[usdtColumn] || 0);
        const usdtBefore = parseFloat(row[usdtBeforeColumn] || 0);
        const price = parseFloat(row[priceColumn] || 0);
        const fees = parseFloat(row[feesColumn] || 0);
        const rawStatus = row[statusColumn] || 'COMPLETED';
        const date = row[dateColumn] || '';
        
        // تحديد حالة العملية (COMPLETED, CANCELLED, PENDING)
        let status: 'COMPLETED' | 'CANCELLED' | 'PENDING';
        if (typeof rawStatus === 'string') {
          const normalizedStatus = rawStatus.toString().trim().toUpperCase();
          if (normalizedStatus.includes('CANCEL') || normalizedStatus.includes('CANCELLED') || normalizedStatus.includes('CANCELED') || normalizedStatus.includes('ملغ')) {
            status = 'CANCELLED';
          } else if (normalizedStatus.includes('PEND') || normalizedStatus.includes('PENDING') || normalizedStatus.includes('معلق') || normalizedStatus.includes('قيد')) {
            status = 'PENDING';
          } else {
            status = 'COMPLETED';
          }
        } else {
          status = 'COMPLETED'; // الحالة الافتراضية هي مكتملة
        }
        
        // تحديد نوع العملية (P2P أو E-Voucher) استناداً فقط لعمود Trade Type
        let tradeType = '';

        // استخراج قيمة نوع التداول (TradeType) من الصف - هذا هو المصدر الوحيد للتصنيف
        if (row[tradeTypeColumn]) {
          // تحويل إلى نص وإزالة المسافات والتحويل للحروف الصغيرة للتوحيد
          const normalizedType = row[tradeTypeColumn].toString().trim().toLowerCase();
          
          // تصنيف بناءً على القيمة
          if (normalizedType === 'p2p' || normalizedType.includes('p2p')) {
            tradeType = 'P2P';
          } else if (
            normalizedType === 'e-voucher' || 
            normalizedType === 'evoucher' || 
            normalizedType.includes('voucher') || 
            normalizedType.includes('فاوتشر') ||
            normalizedType.includes('e voucher')
          ) {
            tradeType = 'E-Voucher';
          } else {
            // في حالة وجود قيمة غير معروفة، نسجل تحذير
            console.log(`تحذير: قيمة غير معروفة في عمود Trade Type: "${normalizedType}"`);
            
            // محاولة التصنيف بناءً على المصدر فقط
            if (row[sourceColumn]) {
              const source = row[sourceColumn].toString().toLowerCase();
              if (source.includes('e-voucher') || source.includes('evoucher') || source.includes('voucher') || source.includes('فاوتشر')) {
                tradeType = 'E-Voucher';
                console.log(`  تم التصنيف بناءً على المصدر: E-Voucher`);
              } else if (source.includes('p2p') || source.includes('بي تو بي')) {
                tradeType = 'P2P';
                console.log(`  تم التصنيف بناءً على المصدر: P2P`);
              }
            }
            
            // إذا لم نتمكن من التصنيف، نعتبره غير معروف
            if (!tradeType) {
              tradeType = 'غير معروف';
              console.log(`  لم يتم التعرف على نوع المعاملة`);
            }
          }
        } 
        // إذا كان العمود فارغًا، نستخدم طرق التخمين البديلة
        else {
          console.log(`تحذير: عمود Trade Type فارغ للصف ${index}، محاولة التخمين...`);
          
          // محاولة التخمين من Source فقط
          if (row[sourceColumn]) {
            const source = row[sourceColumn].toString().toLowerCase();
            if (source.includes('e-voucher') || source.includes('evoucher') || source.includes('voucher') || source.includes('فاوتشر')) {
              tradeType = 'E-Voucher';
              console.log(`  تخمين من Source: E-Voucher`);
            } else if (source.includes('p2p') || source.includes('بي تو بي')) {
              tradeType = 'P2P';
              console.log(`  تخمين من Source: P2P`);
            }
          }
          
          // إذا لم نتمكن من التخمين بناءً على المصدر، نعتبره غير معروف
          if (!tradeType) {
            tradeType = 'غير معروف';
            console.log(`  لم يتم التعرف على نوع المعاملة`);
          }
        }
        
        // ملحوظة: يمكن أن نترك النوع فارغاً ونعالجه لاحقاً لتجنب رفض العمليات
        if (!rawType) {
          // إذا كنا في شك، نستخدم Buy كافتراضي
          rawType = 'Buy';
        }
        
        const reference = row.Reference || `row-${index}`;
        
        console.log(`صف ${index}: Reference=${reference}, Type=${rawType}, Currency=${currency}, USDT=${usdt}, TradeType=${tradeType}`);
        
        return {
          reference: reference,
          type: rawType,
          currency: currency,
          amount: amount,
          realAmount: realAmount,
          usdtBefore: usdtBefore,
          usdt: usdt,
          price: price,
          fees: fees,
          status: status,
          date: date,
          tradeType: tradeType,
          source: row[sourceColumn] || ''
        };
      });
      
    console.log(`تم تحويل ${allTransactions.length} صف إلى كائنات العمليات`);

    // إحصاء أنواع العمليات قبل التصفية
    allTransactions.forEach(transaction => {
      if (transaction.tradeType === 'P2P') p2pTransactionsCount++;
      else if (transaction.tradeType === 'E-Voucher') evoucherTransactionsCount++;
    });
    
    console.log(`إجمالي العمليات: ${allTransactions.length}`);
    console.log(`عمليات P2P: ${p2pTransactionsCount}`);
    console.log(`عمليات E-Voucher: ${evoucherTransactionsCount}`);

    // تصفية خفيفة للتأكد من صلاحية العمليات
    const validTransactions = allTransactions.filter(transaction => {
      // تجاهل العمليات الملغاة (CANCELLED) تماماً
      if (transaction.status === 'CANCELLED' && !returnAllTransactions) {
        console.log(`تجاهل العملية ${transaction.reference} لأنها ملغاة (CANCELLED)`);
        return false;
      }
      
      // العمليات المعلقة (PENDING) تتم معالجتها بشكل خاص، لكن نقبلها في قائمة العمليات الصالحة
      if (transaction.status === 'PENDING') {
        console.log(`عملية معلقة: ${transaction.reference}`);
      }
      
      // نتساهل في شرط التاريخ - إذا كان فارغًا نعتبره صالحًا ونضيف تاريخًا افتراضيًا
      if (!transaction.date || isNaN(new Date(transaction.date).getTime())) {
        transaction.date = new Date().toISOString().split('T')[0]; // استخدام تاريخ اليوم كافتراضي
        console.log(`تصحيح تاريخ غير صالح لـ ${transaction.reference} إلى ${transaction.date}`);
      }
      
      // نتساهل في شرط القيم أيضًا - إذا كانت هناك مشكلة في القيم نحاول إصلاحها
      let hasValidValues = transaction.usdt > 0 || transaction.realAmount > 0;
      if (!hasValidValues) {
        console.log(`قيم غير صالحة لـ ${transaction.reference}: USDT=${transaction.usdt}, Amount=${transaction.realAmount}`);
        
        // محاولة ذكية لإصلاح القيم
        if (transaction.price > 0) {
          // إذا كان لدينا سعر، يمكننا تقدير القيم المفقودة
          if (transaction.usdt <= 0 && transaction.realAmount > 0) {
            transaction.usdt = transaction.realAmount / transaction.price;
            console.log(`تصحيح قيمة USDT لـ ${transaction.reference} إلى ${transaction.usdt}`);
            hasValidValues = true;
          } else if (transaction.realAmount <= 0 && transaction.usdt > 0) {
            transaction.realAmount = transaction.usdt * transaction.price;
            console.log(`تصحيح قيمة Amount لـ ${transaction.reference} إلى ${transaction.realAmount}`);
            hasValidValues = true;
          }
        }
      }
      
      // نتساهل في شرط النوع - جميع العمليات تعتبر صالحة
      const isValidType = transaction.type === 'Buy' || transaction.type === 'Sell';
      if (!isValidType) {
        console.log(`نوع غير صالح لـ ${transaction.reference}: ${transaction.type}`);
        
        // نفترض أنها Buy إذا كنا في شك
        transaction.type = 'Buy';
        console.log(`تصحيح نوع العملية لـ ${transaction.reference} إلى Buy`);
      }
      
      return true; // قبول جميع العمليات غير الملغاة
    });
    
    console.log(`عدد العمليات بعد التصفية الخفيفة: ${validTransactions.length}`);

    // تصفية نهائية - فقط العمليات المصنفة كـ P2P في عمود Trade Type والمكتملة (COMPLETED)
    finalFilteredTransactions = validTransactions.filter(transaction => {
      // نقبل فقط العمليات التي نوعها P2P في عمود TradeType إذا لم نكن نريد استرداد جميع العمليات
      if (returnAllTransactions) {
        return true; // إرجاع جميع العمليات
      }
      
      // تحقق من أن العملية هي P2P وليست معلقة
      const isP2PTransaction = transaction.tradeType === 'P2P';
      const isCompleted = transaction.status === 'COMPLETED'; // نتأكد أن العملية مكتملة وليست معلقة
      
      console.log(`تصفية عملية ${transaction.reference}: نوع=${transaction.type}, عملة=${transaction.currency}, نوع_تداول=${transaction.tradeType}, حالة=${transaction.status}, مقبولة=${isP2PTransaction && isCompleted}`);
      
      return isP2PTransaction && isCompleted; // قبول فقط P2P المكتملة
    });

    console.log(`عدد العمليات النهائية: ${finalFilteredTransactions.length}`);

    // إذا لم تكن هناك عمليات صالحة بعد التصفية، نعرض رسالة خطأ واضحة
    if (finalFilteredTransactions.length === 0 && !returnAllTransactions) {
      console.log('لم يتم العثور على عمليات P2P صالحة في الملف');
      // نعرض رسالة خطأ بدلاً من استخدام عمليات E-Voucher كبديل
      throw new Error('لم يتم العثور على عمليات P2P صالحة في الملف. تأكد من أن الملف يحتوي على عمليات P2P.');
    }

    // ترتيب العمليات حسب التاريخ
    finalFilteredTransactions.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    // حساب إحصائيات العمليات
    const stats = {
      total: allTransactions.length,
      p2p: {
        total: allTransactions.filter(t => t.tradeType === 'P2P').length,
        completed: allTransactions.filter(t => t.tradeType === 'P2P' && t.status === 'COMPLETED').length,
        cancelled: allTransactions.filter(t => t.tradeType === 'P2P' && t.status === 'CANCELLED').length
      },
      evoucher: {
        total: allTransactions.filter(t => t.tradeType === 'E-Voucher').length,
        completed: allTransactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'COMPLETED').length,
        cancelled: allTransactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'CANCELLED').length
      },
      filtered: finalFilteredTransactions.length
    };

    // طباعة ملخص العمليات
    console.log(`تم استيراد ${stats.total} عملية بنجاح`);
    console.log(`- عمليات P2P: ${stats.p2p.total} (${stats.p2p.completed} مكتملة، ${stats.p2p.cancelled} ملغاة)`);
    console.log(`- عمليات E-Voucher: ${stats.evoucher.total} (${stats.evoucher.completed} مكتملة، ${stats.evoucher.cancelled} ملغاة)`);
    console.log(`- عدد العمليات بعد التصفية: ${stats.filtered} (P2P مكتملة فقط)`);

    // استخراج المعاملات المعلقة
    const pendingTransactions = validTransactions.filter(transaction => 
      transaction.tradeType === 'P2P' && transaction.status === 'PENDING'
    );

    // إضافة معلومات المعاملات المعلقة للإحصائيات
    console.log(`عدد المعاملات المعلقة: ${pendingTransactions.length}`);
    if (pendingTransactions.length > 0) {
      console.log('تفاصيل المعاملات المعلقة:');
      pendingTransactions.forEach(tx => {
        console.log(`- ${tx.reference}: ${tx.type} ${tx.usdt} USDT مقابل ${tx.realAmount} ${tx.currency}`);
      });
    }

    return finalFilteredTransactions;
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
  
  // تهيئة معلومات متوسط التكلفة بطريقة أكثر دقة
  Object.keys(initialBalances).forEach(currency => {
    // القيمة الافتراضية لمعدل الصرف هي 3.67 للجميع
    const defaultRate = 3.67;
    
    // استخدام السعر الأولي المعطى أو القيمة الافتراضية
    const initialRate = initialRates[currency] || defaultRate;
    
    // تأكد من معالجة الرصيد الأولي بشكل صحيح
    const initialAmount = initialBalances[currency] || 0;
    
    // إنشاء كائن معلومات التكلفة مع قيم دقيقة
    costInfo[currency] = {
      totalAmount: initialAmount,
      // التكلفة الأولية = المبلغ الأولي × السعر الأولي
      totalCostInBase: initialAmount * initialRate,
      weightedAvgRate: initialRate,
      initialAmount: initialAmount,
      initialRate: initialRate,
      acquiredAmount: 0
    };
    
    // طباعة لمراقبة التهيئة - للتشخيص
    console.log(`تهيئة متوسط تكلفة ${currency}: مبلغ=${initialAmount}, سعر=${initialRate}, إجمالي تكلفة=${initialAmount * initialRate}`);
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
      currencyCostInfo.totalAmount = currentBalances[transaction.currency]; // تحديث الكمية لتطابق الرصيد الحالي
      
      // تعديل خاص للدرهم AED: نحافظ على متوسط سعره متوافق مع USDT
      if (transaction.currency === 'AED') {
        // حساب متوسط سعر الشراء الجديد لـ USDT
        const usdtCostInfo = { ...updatedCostInfo['USDT'] };
        const prevUsdtTotal = usdtCostInfo.totalAmount;
        const prevUsdtCost = usdtCostInfo.totalCostInBase;
        
        // محاكاة متوسط USDT الجديد
        const newUsdtTotal = prevUsdtTotal + transaction.usdt;
        const newUsdtCost = prevUsdtCost + transaction.realAmount;
        const newAvgRate = newUsdtCost / newUsdtTotal;
        
        // تطبيق نفس المتوسط على AED
        currencyCostInfo.weightedAvgRate = newAvgRate;
        currencyCostInfo.totalCostInBase = currencyCostInfo.totalAmount * newAvgRate;
        
        console.log(`تحديث متوسط سعر AED (شراء): ${newAvgRate}`);
      } 
      else {
        // العملات الأخرى تستخدم المعادلة الأصلية
        // تحسين حساب التكلفة الإجمالية للعملة المحلية
        // نحافظ على نسبة التكلفة بين المبلغ الأولي والمبلغ المتبقي
        if (currencyCostInfo.totalAmount < currencyCostInfo.initialAmount) {
          // إذا كان المبلغ المتبقي أقل من المبلغ الأولي، نقلل قيمة المبلغ الأصلي
          currencyCostInfo.initialAmount = currencyCostInfo.totalAmount;
        }
        
        currencyCostInfo.totalCostInBase = currencyCostInfo.initialAmount * currencyCostInfo.initialRate;
      }
      
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
      
      // تحديث معلومات متوسط التكلفة للعملة المحلية (تصحيح لعملة AED)
      const currencyCostInfo = { ...updatedCostInfo[transaction.currency] };
      currencyCostInfo.totalAmount += transaction.realAmount;
      
      // استخدام معادلة مختلفة لعملة AED
      if (transaction.currency === 'AED') {
        // نحسب متوسط سعر تكلفة الدرهم بناءً على قيمة USDT المباعة وسعر الشراء المتوسط
        const usdtCostInfo = updatedCostInfo['USDT'];
        const averageUsdtCost = usdtCostInfo.weightedAvgRate;
        
        // نستخدم نفس المتوسط للدرهم
        currencyCostInfo.weightedAvgRate = averageUsdtCost;
        
        // حساب التكلفة الإجمالية بناءً على متوسط السعر
        currencyCostInfo.totalCostInBase = currencyCostInfo.totalAmount * averageUsdtCost;
      }
      else {
        // العملات الأخرى تستخدم الطريقة الحالية
        currencyCostInfo.acquiredAmount += transaction.realAmount;
      
        // تحديث التكلفة الإجمالية للعملة المحلية بناءً على البيع الجديد
        currencyCostInfo.totalCostInBase = (currencyCostInfo.initialAmount * currencyCostInfo.initialRate) +
                                         (currencyCostInfo.acquiredAmount * transaction.price);
                                          
        if (currencyCostInfo.totalAmount > 0) {
          currencyCostInfo.weightedAvgRate = currencyCostInfo.totalCostInBase / currencyCostInfo.totalAmount;
        }
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
    currencyCostInfo: {},
    // إضافة حقول جديدة لتتبع E-Voucher
    eVoucherStats: {
      totalUsdtSold: 0,
      totalTransactions: 0
    }
  };
  
  // استخراج المعاملات المعلقة
  const pendingTransactions: { currency: string, type: 'Buy' | 'Sell', amount: number, usdt: number }[] = [];
  
  // تحديد المعاملة الأخيرة لكل عملة
  let lastRecord: { [currency: string]: CashFlowRecord } = {};

  // تجميع بيانات العمليات
  records.forEach(record => {
    const { currency, type, amount, usdt, balances, costInfo } = record;
    
    // حفظ المعاملة الأخيرة لكل عملة
    lastRecord[currency] = record;
    
    // جمع المعاملات المعلقة من الملاحظات (نفترض أن لديها كلمة "pending" في الوصف)
    if (record.description && record.description.toLowerCase().includes('pending')) {
      pendingTransactions.push({
        currency,
        type,
        amount,
        usdt
      });
    }

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

  // تصحيح متوسط التكلفة للعملات التي تأثرت بالمعاملات المعلقة
  // بشكل خاص للدراهم (AED)
  if (summary.currencyCostInfo['AED']) {
    const currentRate = summary.currencyCostInfo['AED'].weightedAvgRate;
    
    // لوغاريتم لمراقبة القيمة الأصلية قبل التصحيح
    console.log(`متوسط سعر تكلفة AED قبل التصحيح: ${currentRate}`);
    
    if (currentRate < 3 || currentRate > 5) {
      // استخدام متوسط سعر الشراء إذا كان متاحًا
      let fixedRate = 3.67; // قيمة افتراضية
      
      // حساب متوسط سعر الشراء من البيانات الفعلية
      if (summary.totalBuyUsdt > 0 && summary.totalBuy['AED']) {
        fixedRate = summary.totalBuy['AED'] / summary.totalBuyUsdt;
        console.log(`حساب متوسط سعر الشراء = ${summary.totalBuy['AED']} / ${summary.totalBuyUsdt} = ${fixedRate}`);
      } else if (initialRates['AED']) {
        // استخدام السعر الأولي إذا لم تكن هناك مشتريات
        fixedRate = initialRates['AED'];
        console.log(`استخدام سعر الصرف الأولي للدرهم: ${fixedRate}`);
      }
      
      // تطبيق السعر المصحح
      summary.currencyCostInfo['AED'].weightedAvgRate = fixedRate;
      console.log(`تم تصحيح متوسط سعر تكلفة AED إلى: ${fixedRate}`);
    }
  }
  
  // تصحيح متوسط سعر USDT إذا كان غير منطقي
  if (summary.currencyCostInfo['USDT']) {
    const currentRate = summary.currencyCostInfo['USDT'].weightedAvgRate;
    console.log(`متوسط سعر تكلفة USDT قبل التصحيح: ${currentRate}`);
    
    if (currentRate < 3 || currentRate > 5) {
      // استخدام سعر افتراضي أو السعر الأولي
      let fixedRate = initialRates['USDT'] || 3.67;
      
      // طباعة السعر المصحح
      console.log(`تم تصحيح متوسط سعر تكلفة USDT إلى: ${fixedRate}`);
      
      summary.currencyCostInfo['USDT'].weightedAvgRate = fixedRate;
    }
  }

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