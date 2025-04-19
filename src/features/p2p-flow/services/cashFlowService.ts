import { read, utils, WorkBook } from 'xlsx';
import { P2PTransaction, CashFlowRecord, TransactionSummary, CurrencyCostInfo, EVoucherSummary } from '../types/types';

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
  
  // تهيئة معلومات متوسط التكلفة
  Object.keys(initialBalances).forEach(currency => {
    // القيمة الافتراضية لمعدل الصرف هي 3.67 لليوزد و 1 لباقي العملات
    const initialRate = initialRates[currency] || (currency === 'USDT' ? 3.67 : 1);
    
    // تحديد وحدة القياس بشكل صحيح حسب العملة
    let weightedRate = initialRate;
    
    // إذا كانت العملة AED أو عملة أخرى غير USDT، نريد أن نعكس المعدل
    if (currency !== 'USDT' && initialRate) {
      // نستخدم 1/initialRate للعملات غير USDT لتعبر عن USDT/العملة
      weightedRate = initialRate;
    }
    
    costInfo[currency] = {
      totalAmount: initialBalances[currency] || 0,
      totalCostInBase: (initialBalances[currency] || 0) * initialRate,
      weightedAvgRate: weightedRate,
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
      currencyCostInfo.totalAmount += transaction.realAmount;
      
      // نستخدم الطريقة الأصلية لحساب متوسط تكلفة الدرهم
      // بما في ذلك الأرباح المتراكمة التي تعكس القيمة الحقيقية
      currencyCostInfo.acquiredAmount += transaction.realAmount;
      
      // تحديث التكلفة الإجمالية للعملة المحلية بناءً على البيع الجديد
      currencyCostInfo.totalCostInBase = (currencyCostInfo.initialAmount * currencyCostInfo.initialRate) +
                                       (currencyCostInfo.acquiredAmount * transaction.price);
                                        
      if (currencyCostInfo.totalAmount > 0) {
        // ضمان العرض الصحيح لمتوسط التكلفة
        // للدراهم (AED)، نضمن أن تكون القيمة دائمًا معكوسة بشكل صحيح
        if (transaction.currency === 'AED') {
          // تصحيح خاص للدراهم - نريد دائمًا AED/USDT
          const costPerUsdt = transaction.price; // سعر الـ USDT بالدراهم
          currencyCostInfo.weightedAvgRate = costPerUsdt; // حوالي 3.67 ~ 3.70
        } else {
          currencyCostInfo.weightedAvgRate = currencyCostInfo.totalCostInBase / currencyCostInfo.totalAmount;
        }
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
      
      // تحديث معلومات متوسط التكلفة للعملة المحلية
      const currencyCostInfo = { ...updatedCostInfo[transaction.currency] };
      currencyCostInfo.totalAmount += transaction.realAmount;
      
      // نستخدم الطريقة الأصلية لحساب متوسط تكلفة الدرهم
      // بما في ذلك الأرباح المتراكمة التي تعكس القيمة الحقيقية
      currencyCostInfo.acquiredAmount += transaction.realAmount;
      
      // تحديث التكلفة الإجمالية للعملة المحلية بناءً على البيع الجديد
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
    
    // تصحيح نهائي لمتوسط سعر تكلفة الدراهم
    if (costInfo['AED'] && costInfo['AED'].totalAmount > 0) {
      // بالنسبة للدراهم، نضمن أن تكون القيمة النهائية دائمًا حوالي 3.67~3.7
      const lastTransactionForAED = transactions
        .filter(tx => tx.type === 'Sell' && tx.currency === 'AED' && tx.status === 'COMPLETED')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (lastTransactionForAED) {
        // استخدام أحدث سعر بيع USDT مقابل درهم كمرجع
        costInfo['AED'].weightedAvgRate = lastTransactionForAED.price;
      } else {
        // استخدام قيمة افتراضية إذا لم يكن هناك معاملات بيع
        costInfo['AED'].weightedAvgRate = 3.67;
      }
    }

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
export const exportCashFlowToExcel = (records: CashFlowRecord[], summaryData?: { 
  eVoucherUsdtSold?: number, 
  summary?: TransactionSummary,
  allTransactions?: P2PTransaction[],
  pendingTransactions?: P2PTransaction[],
  eVoucherTransactions?: P2PTransaction[],
  eVoucherSummary?: EVoucherSummary
}): WorkBook => {
  // إنشاء كتاب عمل جديد
  const workbook = utils.book_new();
  
  // ====================== ورقة سجل التدفق النقدي ======================
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
      'Reference': record.id,
      'Type': record.type === 'Buy' ? 'Buy' : 'Sell',
      'Currency': record.currency,
      'Amount': record.amount.toFixed(4),
      'USDT Amount': record.usdt.toFixed(4),
      'Price': record.price.toFixed(4),
      'Description': record.description,
      ...balancesData
    };
  });
  
  // إضافة صفوف الملخصات
  if (exportData.length > 0 && summaryData?.summary) {
    // إضافة صف فارغ للفصل
    const emptyRow = {
      'Date': '',
      'Reference': '',
      'Type': '',
      'Currency': '',
      'Amount': '',
      'USDT Amount': '',
      'Price': '',
      'Description': '',
    };
    
    exportData.push(emptyRow);
    
    // صفوف ملخص البيع والشراء
    exportData.push({
      'Date': new Date().toLocaleString('en-US'),
      'Reference': '',
      'Type': 'Buy',
      'Currency': '',
      'Amount': '',
      'USDT Amount': summaryData.summary.totalBuyUsdt.toFixed(4),
      'Price': '',
      'Description': `Total USDT Bought: ${summaryData.summary.totalBuyUsdt.toFixed(4)}`,
    });
    
    exportData.push({
      'Date': new Date().toLocaleString('en-US'),
      'Reference': '',
      'Type': 'Sell',
      'Currency': '',
      'Amount': '',
      'USDT Amount': summaryData.summary.totalSellUsdt.toFixed(4),
      'Price': '',
      'Description': `Total USDT Sold: ${summaryData.summary.totalSellUsdt.toFixed(4)}`,
    });
    
    // صف E-Voucher
    if (summaryData.eVoucherUsdtSold) {
      exportData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Sell',
        'Currency': '',
        'Amount': '',
        'USDT Amount': summaryData.eVoucherUsdtSold.toFixed(4),
        'Price': '',
        'Description': `Total USDT Used in E-Voucher: ${summaryData.eVoucherUsdtSold.toFixed(4)}`,
      });
    }
    
    // الأرصدة النهائية
    exportData.push(emptyRow);
    
    // تعيين لون خلفية لاستخدامه في الملخصات
    
    // إضافة الأرصدة النهائية
    Object.entries(summaryData.summary.currentBalances).forEach(([currency, balance]) => {
      // عرض الرصيد النهائي لـ USDT بعد الخصم
      const displayBalance = currency === 'USDT' && summaryData.eVoucherUsdtSold
        ? balance - summaryData.eVoucherUsdtSold
        : balance;
        
      exportData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Buy',
        'Currency': currency,
        'Amount': displayBalance.toFixed(4),
        'USDT Amount': '',
        'Price': '',
        'Description': `Final Balance ${currency}: ${displayBalance.toFixed(4)}`,
      });
      
      // إذا كان العملة USDT وتم استخدام جزء منها في E-Voucher
      if (currency === 'USDT' && summaryData.eVoucherUsdtSold) {
        exportData.push({
          'Date': new Date().toLocaleString('en-US'),
          'Reference': '',
          'Type': 'Sell',
          'Currency': currency,
          'Amount': summaryData.eVoucherUsdtSold.toFixed(4),
          'USDT Amount': '',
          'Price': '',
          'Description': `USDT Used for E-Voucher: ${summaryData.eVoucherUsdtSold.toFixed(4)}`,
        });
        
        // إضافة صف يوضح الرصيد الإجمالي قبل الخصم
        exportData.push({
          'Date': new Date().toLocaleString('en-US'),
          'Reference': '',
          'Type': 'Buy',
          'Currency': currency,
          'Amount': balance.toFixed(4),
          'USDT Amount': '',
          'Price': '',
          'Description': `Total USDT (Before E-Voucher Deduction): ${balance.toFixed(4)}`,
        });
      }
    });
    
    // ربح التداول
    if (summaryData.summary.totalSellUsdt > 0 && summaryData.summary.totalBuyUsdt > 0) {
      const totalBuyAmount = summaryData.summary.totalBuy['AED'] || 0;
      const totalSellAmount = summaryData.summary.totalSell['AED'] || 0;
      
      // حساب الربح الفعلي من البيانات المتاحة
      const actualProfit = totalSellAmount - ((summaryData.summary.totalSellUsdt * totalBuyAmount) / summaryData.summary.totalBuyUsdt);
      
      exportData.push(emptyRow);
      exportData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Sell',
        'Currency': 'AED',
        'Amount': Math.abs(actualProfit).toFixed(4),
        'USDT Amount': '',
        'Price': '',
        'Description': `P2P Trading Profit: ${Math.abs(actualProfit).toFixed(4)} AED`,
      });
    }
  }

  // إنشاء ورقة عمل للتدفق النقدي
  const cashFlowWorksheet = utils.json_to_sheet(exportData);
  
  // تطبيق العرض والتنسيق
  const cashFlowColumns = [
    { wch: 20 },  // Date
    { wch: 15 },  // Reference
    { wch: 8 },   // Type
    { wch: 8 },   // Currency
    { wch: 12 },  // Amount
    { wch: 12 },  // USDT Amount
    { wch: 8 },   // Price
    { wch: 60 },  // Description
    { wch: 15 },  // Balance USDT
    { wch: 15 },  // Balance AED
  ];
  cashFlowWorksheet['!cols'] = cashFlowColumns;
  
  // تطبيق تنسيق العناوين بالخط العريض
  const headerRange = { s: { c: 0, r: 0 }, e: { c: Object.keys(exportData[0] || {}).length - 1, r: 0 } };
  for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
    const cell = utils.encode_cell({ c: C, r: 0 });
    if (!cashFlowWorksheet[cell]) continue;
    cashFlowWorksheet[cell].s = { font: { bold: true } };
  }
  
  // إضافة الورقة إلى المصنف
  utils.book_append_sheet(workbook, cashFlowWorksheet, 'Cash Flow Records');
  
  // ====================== ورقة المعاملات المعلقة ======================
  if (summaryData?.pendingTransactions && summaryData.pendingTransactions.length > 0) {
    // تعريف واجهة لبيانات التصدير (لحل مشكلة الأنواع)
    interface PendingExportData {
      'Date': string;
      'Reference': string;
      'Type': string;
      'Status': string;
      'Currency': string;
      'Amount': string;
      'USDT': string;
      'Price': string;
      'Description': string;
    }
    
    // تحويل المعاملات المعلقة إلى تنسيق مناسب للتصدير
    const pendingData: PendingExportData[] = summaryData.pendingTransactions.map(tx => {
      return {
        'Date': new Date(tx.date).toLocaleString('en-US'),
        'Reference': tx.reference,
        'Type': tx.type === 'Buy' ? 'Buy' : 'Sell',
        'Status': 'PENDING',
        'Currency': tx.currency,
        'Amount': tx.amount.toFixed(4),
        'USDT': tx.usdt.toFixed(4),
        'Price': tx.price.toFixed(4),
        'Description': tx.source || ''
      };
    });
    
    // إضافة ملخص للمعاملات المعلقة
    if (pendingData.length > 0) {
      // تجميع إحصاءات المعاملات المعلقة
      const pendingSummary = summaryData.pendingTransactions.reduce((acc, tx) => {
        const currency = tx.currency;
        
        if (tx.type === 'Buy') {
          acc.totalBuyUsdt += tx.usdt;
          acc.totalBuy[currency] = (acc.totalBuy[currency] || 0) + tx.amount;
        } else {
          acc.totalSellUsdt += tx.usdt;
          acc.totalSell[currency] = (acc.totalSell[currency] || 0) + tx.amount;
        }
        
        return acc;
      }, {
        totalBuyUsdt: 0,
        totalSellUsdt: 0,
        totalBuy: {} as Record<string, number>,
        totalSell: {} as Record<string, number>
      });
      
      // صف فارغ
      const emptyRow: PendingExportData = {
        'Date': '',
        'Reference': '',
        'Type': 'Buy',
        'Status': 'PENDING',
        'Currency': '',
        'Amount': '',
        'USDT': '',
        'Price': '',
        'Description': ''
      };
      
      pendingData.push(emptyRow);
      
      // إضافة ملخص الشراء
      if (pendingSummary.totalBuyUsdt > 0) {
        pendingData.push({
          'Date': new Date().toLocaleString('en-US'),
          'Reference': '',
          'Type': 'Buy',
          'Status': 'PENDING',
          'Currency': '',
          'Amount': '',
          'USDT': pendingSummary.totalBuyUsdt.toFixed(4),
          'Price': '',
          'Description': `Total Pending Buy USDT: ${pendingSummary.totalBuyUsdt.toFixed(4)}`
        });
        
        // تفاصيل الشراء لكل عملة
        Object.entries(pendingSummary.totalBuy).forEach(([currency, amount]) => {
          pendingData.push({
            'Date': new Date().toLocaleString('en-US'),
            'Reference': '',
            'Type': 'Buy',
            'Status': 'PENDING',
            'Currency': currency,
            'Amount': amount.toFixed(4),
            'USDT': '',
            'Price': '',
            'Description': `Total Pending Buy ${currency}: ${amount.toFixed(4)}`
          });
        });
      }
      
      // إضافة ملخص البيع
      if (pendingSummary.totalSellUsdt > 0) {
        pendingData.push(emptyRow);
        
        pendingData.push({
          'Date': new Date().toLocaleString('en-US'),
          'Reference': '',
          'Type': 'Sell',
          'Status': 'PENDING',
          'Currency': '',
          'Amount': '',
          'USDT': pendingSummary.totalSellUsdt.toFixed(4),
          'Price': '',
          'Description': `Total Pending Sell USDT: ${pendingSummary.totalSellUsdt.toFixed(4)}`
        });
        
        // تفاصيل البيع لكل عملة
        Object.entries(pendingSummary.totalSell).forEach(([currency, amount]) => {
          pendingData.push({
            'Date': new Date().toLocaleString('en-US'),
            'Reference': '',
            'Type': 'Sell',
            'Status': 'PENDING',
            'Currency': currency,
            'Amount': amount.toFixed(4),
            'USDT': '',
            'Price': '',
            'Description': `Total Pending Sell ${currency}: ${amount.toFixed(4)}`
          });
        });
      }
    }
    
    // إنشاء ورقة المعاملات المعلقة
    const pendingWorksheet = utils.json_to_sheet(pendingData);
    
    // تطبيق العرض
    const pendingColumns = [
      { wch: 20 },  // Date
      { wch: 15 },  // Reference
      { wch: 8 },   // Type
      { wch: 10 },  // Status
      { wch: 8 },   // Currency
      { wch: 12 },  // Amount
      { wch: 12 },  // USDT
      { wch: 8 },   // Price
      { wch: 60 },  // Description
    ];
    pendingWorksheet['!cols'] = pendingColumns;
    
    // تطبيق تنسيق العناوين بالخط العريض
    const pendingHeaderRange = { s: { c: 0, r: 0 }, e: { c: Object.keys(pendingData[0] || {}).length - 1, r: 0 } };
    for (let C = pendingHeaderRange.s.c; C <= pendingHeaderRange.e.c; ++C) {
      const cell = utils.encode_cell({ c: C, r: 0 });
      if (!pendingWorksheet[cell]) continue;
      pendingWorksheet[cell].s = { font: { bold: true } };
    }
    
    // إضافة الورقة إلى المصنف
    utils.book_append_sheet(workbook, pendingWorksheet, 'Pending Transactions');
  }
  
  // ====================== ورقة معاملات E-Voucher ======================
  if (summaryData?.eVoucherTransactions && summaryData.eVoucherTransactions.length > 0) {
    // تعريف واجهة لبيانات التصدير (لحل مشكلة الأنواع)
    interface EVoucherExportData {
      'Date': string;
      'Reference': string;
      'Type': string;
      'Status': string;
      'Currency': string;
      'Amount': string;
      'USDT': string;
      'Price': string;
      'Description': string;
    }
    
    // تحويل معاملات E-Voucher إلى تنسيق مناسب للتصدير
    const eVoucherData: EVoucherExportData[] = summaryData.eVoucherTransactions.map(tx => {
      // تحديد الحالة بشكل صحيح (COMPLETED أو CANCELLED أو PENDING)
      const status = tx.status === 'COMPLETED' ? 'COMPLETED' : 
                    tx.status === 'CANCELLED' ? 'CANCELLED' : 
                    tx.status === 'PENDING' ? 'PENDING' : 'COMPLETED';
      
      return {
        'Date': new Date(tx.date).toLocaleString('en-US'),
        'Reference': tx.reference,
        'Type': tx.type === 'Buy' ? 'Buy' : 'Sell',
        'Status': status,
        'Currency': tx.currency,
        'Amount': tx.amount.toFixed(4),
        'USDT': tx.usdt.toFixed(4),
        'Price': tx.price.toFixed(4),
        'Description': tx.source || ''
      };
    });
    
    // إضافة ملخص E-Voucher
    if (summaryData.eVoucherSummary && eVoucherData.length > 0) {
      // صف فارغ
      const emptyRow: EVoucherExportData = {
        'Date': '',
        'Reference': '',
        'Type': 'Buy',
        'Status': 'COMPLETED',
        'Currency': '',
        'Amount': '',
        'USDT': '',
        'Price': '',
        'Description': ''
      };
      
      eVoucherData.push(emptyRow);
      
      // إجماليات E-Voucher
      eVoucherData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Buy',
        'Status': 'COMPLETED',
        'Currency': 'EGP',
        'Amount': summaryData.eVoucherSummary.totalEGP.toFixed(4),
        'USDT': '',
        'Price': '',
        'Description': `Total Egyptian Pounds: ${summaryData.eVoucherSummary.totalEGP.toFixed(4)} EGP`
      });
      
      eVoucherData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Buy',
        'Status': 'COMPLETED',
        'Currency': 'AED',
        'Amount': summaryData.eVoucherSummary.totalAED.toFixed(4),
        'USDT': '',
        'Price': '',
        'Description': `Total Emirati Dirhams: ${summaryData.eVoucherSummary.totalAED.toFixed(4)} AED`
      });
      
      eVoucherData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Sell',
        'Status': 'COMPLETED',
        'Currency': 'USDT',
        'Amount': '',
        'USDT': summaryData.eVoucherSummary.totalUSDT.toFixed(4),
        'Price': '',
        'Description': `Total USDT Used: ${summaryData.eVoucherSummary.totalUSDT.toFixed(4)}`
      });
      
      // معدلات التحويل
      eVoucherData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Buy',
        'Status': 'COMPLETED',
        'Currency': '',
        'Amount': '',
        'USDT': '',
        'Price': summaryData.eVoucherSummary.avgAEDtoEGP.toFixed(4),
        'Description': `Average Dirham to Pound Rate: ${summaryData.eVoucherSummary.avgAEDtoEGP.toFixed(4)} EGP/AED`
      });
      
      eVoucherData.push({
        'Date': new Date().toLocaleString('en-US'),
        'Reference': '',
        'Type': 'Buy',
        'Status': 'COMPLETED',
        'Currency': '',
        'Amount': '',
        'USDT': '',
        'Price': summaryData.eVoucherSummary.avgUSDTtoEGP.toFixed(4),
        'Description': `Average USDT to Pound Rate: ${summaryData.eVoucherSummary.avgUSDTtoEGP.toFixed(4)} EGP/USDT`
      });
    }
    
    // إنشاء ورقة E-Voucher
    const eVoucherWorksheet = utils.json_to_sheet(eVoucherData);
    
    // تطبيق العرض
    const eVoucherColumns = [
      { wch: 20 },  // Date
      { wch: 15 },  // Reference
      { wch: 12 },  // Type
      { wch: 10 },  // Status
      { wch: 8 },   // Currency
      { wch: 12 },  // Amount
      { wch: 12 },  // USDT
      { wch: 10 },  // Price
      { wch: 60 },  // Description
    ];
    eVoucherWorksheet['!cols'] = eVoucherColumns;
    
    // تطبيق تنسيق العناوين بالخط العريض
    const eVoucherHeaderRange = { s: { c: 0, r: 0 }, e: { c: Object.keys(eVoucherData[0] || {}).length - 1, r: 0 } };
    for (let C = eVoucherHeaderRange.s.c; C <= eVoucherHeaderRange.e.c; ++C) {
      const cell = utils.encode_cell({ c: C, r: 0 });
      if (!eVoucherWorksheet[cell]) continue;
      eVoucherWorksheet[cell].s = { font: { bold: true } };
    }
    
    // إضافة الورقة إلى المصنف
    utils.book_append_sheet(workbook, eVoucherWorksheet, 'E-Voucher Transactions');
  }
  
  // ====================== ورقة ملخص الإحصائيات ======================
  if (summaryData?.summary) {
    const statsData = [];
    
    // عنوان
    statsData.push({
      'Section': 'Statistics Summary',
      'Statement': 'Value',
      'Details': ''
    });
    
    // صف فارغ
    statsData.push({
      'Section': '',
      'Statement': '',
      'Details': ''
    });
    
    // إحصائيات العمليات
    statsData.push({
      'Section': 'P2P Operations',
      'Statement': 'Statistics',
      'Details': ''
    });
    
    // شراء USDT
    statsData.push({
      'Section': '',
      'Statement': 'Total USDT Bought',
      'Details': summaryData.summary.totalBuyUsdt.toFixed(4)
    });
    
    // بيع USDT
    statsData.push({
      'Section': '',
      'Statement': 'Total USDT Sold',
      'Details': summaryData.summary.totalSellUsdt.toFixed(4)
    });
    
    // تفاصيل الشراء
    Object.entries(summaryData.summary.totalBuy).forEach(([currency, amount]) => {
      statsData.push({
        'Section': '',
        'Statement': `Total Buy ${currency}`,
        'Details': amount.toFixed(4)
      });
    });
    
    // تفاصيل البيع
    Object.entries(summaryData.summary.totalSell).forEach(([currency, amount]) => {
      statsData.push({
        'Section': '',
        'Statement': `Total Sell ${currency}`,
        'Details': amount.toFixed(4)
      });
    });
    
    // متوسط أسعار الشراء
    Object.entries(summaryData.summary.avgBuyPrice).forEach(([currency, rate]) => {
      statsData.push({
        'Section': '',
        'Statement': `Average Buy Price ${currency}/USDT`,
        'Details': rate.toFixed(4)
      });
    });
    
    // متوسط أسعار البيع
    Object.entries(summaryData.summary.avgSellPrice).forEach(([currency, rate]) => {
      statsData.push({
        'Section': '',
        'Statement': `Average Sell Price ${currency}/USDT`,
        'Details': rate.toFixed(4)
      });
    });
    
    // صف فارغ
    statsData.push({
      'Section': '',
      'Statement': '',
      'Details': ''
    });
    
    // E-Voucher
    if (summaryData.eVoucherUsdtSold && summaryData.eVoucherSummary) {
      statsData.push({
        'Section': 'E-Voucher Transactions',
        'Statement': 'Statistics',
        'Details': ''
      });
      
      statsData.push({
        'Section': '',
        'Statement': 'Total USDT Used',
        'Details': summaryData.eVoucherSummary.totalUSDT.toFixed(4)
      });
      
      statsData.push({
        'Section': '',
        'Statement': 'Total EGP Sent',
        'Details': summaryData.eVoucherSummary.totalEGP.toFixed(4)
      });
      
      statsData.push({
        'Section': '',
        'Statement': 'Total AED Used',
        'Details': summaryData.eVoucherSummary.totalAED.toFixed(4)
      });
      
      statsData.push({
        'Section': '',
        'Statement': 'Average AED/EGP Rate',
        'Details': summaryData.eVoucherSummary.avgAEDtoEGP.toFixed(4)
      });
      
      statsData.push({
        'Section': '',
        'Statement': 'Average USDT/EGP Rate',
        'Details': summaryData.eVoucherSummary.avgUSDTtoEGP.toFixed(4)
      });
      
      // صف فارغ
      statsData.push({
        'Section': '',
        'Statement': '',
        'Details': ''
      });
    }
    
    // الأرصدة النهائية
    statsData.push({
      'Section': 'Final Balances',
      'Statement': 'Statistics',
      'Details': ''
    });
    
    Object.entries(summaryData.summary.currentBalances).forEach(([currency, balance]) => {
      // عرض الرصيد النهائي لـ USDT بعد الخصم
      const displayBalance = currency === 'USDT' && summaryData.eVoucherUsdtSold
        ? balance - summaryData.eVoucherUsdtSold
        : balance;
        
      statsData.push({
        'Section': '',
        'Statement': `Final Balance ${currency}`,
        'Details': displayBalance.toFixed(4)
      });
      
      // إذا كان العملة USDT وتم استخدام جزء منها في E-Voucher
      if (currency === 'USDT' && summaryData.eVoucherUsdtSold) {
        statsData.push({
          'Section': '',
          'Statement': 'USDT Used in E-Voucher',
          'Details': summaryData.eVoucherUsdtSold.toFixed(4)
        });
        
        // إضافة صف يوضح الرصيد الإجمالي قبل الخصم
        statsData.push({
          'Section': '',
          'Statement': 'Total USDT (Before E-Voucher Deduction)',
          'Details': balance.toFixed(4)
        });
      }
    });
    
    // صف فارغ
    statsData.push({
      'Section': '',
      'Statement': '',
      'Details': ''
    });
    
    // حساب الربح
    if (summaryData.summary.totalSellUsdt > 0 && summaryData.summary.totalBuyUsdt > 0) {
      const totalBuyAmount = summaryData.summary.totalBuy['AED'] || 0;
      const totalSellAmount = summaryData.summary.totalSell['AED'] || 0;
      
      // حساب الربح الفعلي من البيانات المتاحة
      const actualProfit = totalSellAmount - ((summaryData.summary.totalSellUsdt * totalBuyAmount) / summaryData.summary.totalBuyUsdt);
      
      statsData.push({
        'Section': 'Profit',
        'Statement': 'P2P Trading Profit',
        'Details': Math.abs(actualProfit).toFixed(4) + ' AED'
      });
    }
    
    // إنشاء ورقة الإحصائيات
    const statsWorksheet = utils.json_to_sheet(statsData);
    
    // تطبيق العرض
    const statsColumns = [
      { wch: 20 },  // Section
      { wch: 30 },  // Statement
      { wch: 20 },  // Details
    ];
    statsWorksheet['!cols'] = statsColumns;
    
    // تطبيق تنسيق العناوين بالخط العريض
    const statsHeaderRange = { s: { c: 0, r: 0 }, e: { c: Object.keys(statsData[0] || {}).length - 1, r: 0 } };
    for (let C = statsHeaderRange.s.c; C <= statsHeaderRange.e.c; ++C) {
      const cell = utils.encode_cell({ c: C, r: 0 });
      if (!statsWorksheet[cell]) continue;
      statsWorksheet[cell].s = { font: { bold: true } };
    }
    
    // إضافة الورقة إلى المصنف
    utils.book_append_sheet(workbook, statsWorksheet, 'Statistics Summary');
  }
  
  // إرجاع المصنف
  return workbook;
}; 