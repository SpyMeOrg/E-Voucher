import React, { useState, useEffect, useRef } from 'react';
import { writeFile } from 'xlsx';
import { BankBalance, P2PTransaction, CashFlowRecord, TransactionSummary, EVoucherSummary as EVoucherSummaryType } from '../types/types';
import { importExcelFile, createCashFlowRecords, calculateTransactionSummary, exportCashFlowToExcel } from '../services/cashFlowService';
import { calculateEVoucherSummary, readExcelFile } from '../services/eVoucherService';
import { EVoucherSummary } from './EVoucherSummary';

export const P2PFlowTab: React.FC = () => {
  // الأرصدة الأولية
  const [initialBalances, setInitialBalances] = useState<BankBalance[]>(() => {
    const savedBalances = localStorage.getItem('p2pFlowInitialBalances');
    return savedBalances ? JSON.parse(savedBalances) : [{ amount: 0, currency: 'AED', initialRate: 0 }];
  });
  
  // رصيد USDT الأولي
  const [initialUsdtBalance, setInitialUsdtBalance] = useState<number>(() => {
    const savedBalance = localStorage.getItem('p2pFlowInitialUsdtBalance');
    return savedBalance ? parseFloat(savedBalance) : 0;
  });
  
  // سعر صرف USDT الأولي
  const [initialUsdtRate, setInitialUsdtRate] = useState<number>(() => {
    const savedRate = localStorage.getItem('p2pFlowInitialUsdtRate');
    return savedRate ? parseFloat(savedRate) : 3.67;
  });
  
  // العمليات المستوردة
  const [transactions, setTransactions] = useState<P2PTransaction[]>([]);
  
  // سجل التدفق النقدي
  const [cashFlowRecords, setCashFlowRecords] = useState<CashFlowRecord[]>([]);
  
  // ملخص العمليات
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  
  // حالة التحميل
  const [loading, setLoading] = useState<boolean>(false);
  
  // رسالة الخطأ
  const [error, setError] = useState<string | null>(null);
  
  // مرجع حقل إدخال الملف
  const fileInputRef = useRef<HTMLInputElement>(null);

  // حفظ الأرصدة الأولية في التخزين المحلي
  useEffect(() => {
    localStorage.setItem('p2pFlowInitialBalances', JSON.stringify(initialBalances));
  }, [initialBalances]);

  // حفظ رصيد USDT الأولي في التخزين المحلي
  useEffect(() => {
    localStorage.setItem('p2pFlowInitialUsdtBalance', initialUsdtBalance.toString());
  }, [initialUsdtBalance]);
  
  // حفظ سعر صرف USDT الأولي في التخزين المحلي
  useEffect(() => {
    localStorage.setItem('p2pFlowInitialUsdtRate', initialUsdtRate.toString());
  }, [initialUsdtRate]);

  // تحديث سجل التدفق النقدي عند تغير العمليات أو الأرصدة الأولية
  useEffect(() => {
    if (transactions.length > 0) {
      // تحويل الأرصدة الأولية إلى كائن
      const initialBalancesObject: { [currency: string]: number; USDT: number } = {
        USDT: initialUsdtBalance
      };
      
      // تحويل معدلات صرف الأرصدة الأولية إلى كائن
      const initialRatesObject: { [currency: string]: number } = {
        USDT: initialUsdtRate
      };
      
      initialBalances.forEach(balance => {
        initialBalancesObject[balance.currency] = balance.amount;
        if (balance.initialRate) {
          initialRatesObject[balance.currency] = balance.initialRate;
        }
      });
      
      // إنشاء سجل التدفق النقدي مع معدلات الصرف
      const records = createCashFlowRecords(transactions, initialBalancesObject, initialRatesObject);
      setCashFlowRecords(records);
      
      // حساب ملخص العمليات
      const transactionSummary = calculateTransactionSummary(records);
      setSummary(transactionSummary);
    }
  }, [transactions, initialBalances, initialUsdtBalance, initialUsdtRate]);

  // إضافة رصيد بنكي جديد
  const handleAddBankBalance = () => {
    setInitialBalances([...initialBalances, { amount: 0, currency: 'AED', initialRate: 0 }]);
  };

  // حذف رصيد بنكي
  const handleRemoveBankBalance = (index: number) => {
    const newBalances = [...initialBalances];
    newBalances.splice(index, 1);
    setInitialBalances(newBalances);
  };

  // تغيير قيمة رصيد بنكي
  const handleBankBalanceChange = (index: number, field: keyof BankBalance, value: string | number) => {
    const newBalances = [...initialBalances];
    newBalances[index] = {
      ...newBalances[index],
      [field]: field === 'amount' || field === 'initialRate' ? parseFloat(value as string) || 0 : value
    };
    setInitialBalances(newBalances);
  };

  // تغيير قيمة رصيد USDT
  const handleUsdtBalanceChange = (value: string) => {
    setInitialUsdtBalance(parseFloat(value) || 0);
  };
  
  // تغيير سعر صرف USDT الأولي
  const handleUsdtRateChange = (value: string) => {
    setInitialUsdtRate(parseFloat(value) || 3.67);
  };

  // استيراد ملف Excel
  const handleFileSelect = async (file: File) => {
    try {
      // محاولة استيراد الملف
      setLoading(true);
      setError(null);
      
      // حفظ اسم الملف للعرض في العنوان
      setImportedFileName(file.name);
      
      console.log('بدء استيراد الملف:', file.name);
      
      // استيراد عمليات P2P
      const importedTransactions = await importExcelFile(file);
      console.log('تم استيراد العمليات:', importedTransactions.length);
      
      if (importedTransactions.length === 0) {
        console.log('لا توجد عمليات P2P في الملف');
        setError('لا توجد عمليات P2P في الملف. تأكد من أن الملف يحتوي على بيانات صالحة وأعمدة مناسبة.');
        setLoading(false);
        return;
      }
      
      // استيراد كل العمليات بدون تصفية لحساب الإحصائيات وإيجاد المعاملات المعلقة
      const allTransactions = await importExcelFile(file, true);
      
      // استخراج المعاملات المعلقة
      const pendingTransactions = allTransactions.filter(t => 
        t.tradeType === 'P2P' && t.status === 'PENDING'
      );
      
      // استخراج معاملات E-Voucher المكتملة
      const eVoucherTransactions = allTransactions.filter(t => 
        t.tradeType === 'E-Voucher' && t.status === 'COMPLETED'
      );
      
      // حساب إجمالي USDT المستخدمة في E-Voucher
      const totalEVoucherUsdt = eVoucherTransactions
        .filter(t => t.type === 'Sell')
        .reduce((sum, t) => sum + t.usdt, 0);
      
      console.log(`إجمالي USDT المباعة في E-Voucher: ${totalEVoucherUsdt}`);
      
      // حفظ المعاملات المعلقة و E-Voucher في الحالة
      setPendingTransactions(pendingTransactions);
      setEVoucherUsdtSold(totalEVoucherUsdt);
      
      // حساب إحصائيات العمليات
      const stats = {
        p2p: {
          total: 0,
          completed: 0,
          cancelled: 0
        },
        evoucher: {
          total: 0,
          completed: 0,
          cancelled: 0
        }
      };
      
      // حساب عدد العمليات حسب النوع والحالة
      if (allTransactions && allTransactions.length) {
        stats.p2p.total = allTransactions.filter(t => t.tradeType === 'P2P').length;
        stats.p2p.completed = allTransactions.filter(t => t.tradeType === 'P2P' && t.status === 'COMPLETED').length;
        stats.p2p.cancelled = allTransactions.filter(t => t.tradeType === 'P2P' && t.status === 'CANCELLED').length;
        
        stats.evoucher.total = allTransactions.filter(t => t.tradeType === 'E-Voucher').length;
        stats.evoucher.completed = allTransactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'COMPLETED').length;
        stats.evoucher.cancelled = allTransactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'CANCELLED').length;
      }
      
      // عرض رسالة النجاح مع الإحصائيات
      setSuccessMessage(
        `تم استيراد ${allTransactions.length} عملية بنجاح
- عمليات P2P: ${stats.p2p.total} (${stats.p2p.completed} مكتملة، ${stats.p2p.cancelled} ملغاة)
- عمليات E-Voucher: ${stats.evoucher.total} (${stats.evoucher.completed} مكتملة، ${stats.evoucher.cancelled} ملغاة)
- عدد العمليات بعد التصفية: ${importedTransactions.length} (P2P مكتملة فقط)`
      );
      
      setTransactions(importedTransactions);
      
      // استيراد ملخص E-Voucher إذا أمكن
      try {
        console.log('حساب ملخص E-Voucher');
        const jsonData = await readExcelFile(file);
        const eVoucherSummaryData = calculateEVoucherSummary(jsonData);
        setEVoucherSummary(eVoucherSummaryData);
        console.log('تم حساب ملخص E-Voucher:', eVoucherSummaryData);
      } catch (evoucherError) {
        console.error('خطأ في حساب ملخص E-Voucher:', evoucherError);
        // لا نعرض خطأ للمستخدم هنا لأن E-Voucher اختياري
      }
      
      setLoading(false);
    } catch (error) {
      console.error('خطأ في استيراد الملف:', error);
      
      // عرض رسالة خطأ أكثر تفصيلاً
      let errorMessage = 'حدث خطأ أثناء استيراد الملف';
      
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
        
        // إضافة نصائح مفيدة بناءً على نوع الخطأ
        if (errorMessage.includes('لم يتم العثور على عمليات')) {
          errorMessage = `${errorMessage} تأكد من أن الملف يحتوي على الأعمدة الصحيحة: Type (Buy/Sell)، Currency، Amount، USDT، Price.`;
        }
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  // تصدير سجل التدفق النقدي إلى ملف Excel
  const handleExportExcel = () => {
    if (cashFlowRecords.length === 0) {
      setError('لا توجد بيانات للتصدير');
      return;
    }
    
    try {
      // تمرير ملخص البيانات مع سجل التدفق النقدي وكل أنواع المعاملات
      const workbook = exportCashFlowToExcel(cashFlowRecords, {
        eVoucherUsdtSold: eVoucherUsdtSold,
        summary: summary || undefined,
        pendingTransactions: pendingTransactions.length > 0 ? pendingTransactions : undefined,
        eVoucherSummary: eVoucherSummary || undefined,
        // استخراج معاملات E-Voucher
        eVoucherTransactions: transactions.filter(tx => tx.tradeType === 'E-Voucher')
      });
      
      // اسم الملف بتاريخ اليوم
      const today = new Date();
      const dateStr = `${today.getDate()}-${today.getMonth()+1}-${today.getFullYear()}`;
      writeFile(workbook, `سجل_التدفق_النقدي_${dateStr}.xlsx`);
      
      // عرض رسالة نجاح
      setSuccessMessage('تم تصدير سجل التدفق النقدي والملخصات بنجاح');
      
      // إخفاء رسالة النجاح بعد 3 ثوان
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (error) {
      setError('حدث خطأ أثناء تصدير البيانات');
    }
  };

  // تصدير رصيد الإغلاق لليوم التالي
  const handleExportClosingBalance = () => {
    if (!summary || !summary.currentBalances) {
      setError('لا توجد أرصدة حالية للتصدير');
      return;
    }

    // إنشاء أرصدة بنكية جديدة من الأرصدة الحالية
    const newBankBalances: BankBalance[] = [];
    Object.entries(summary.currentBalances).forEach(([currency, balance]) => {
      // تجاهل USDT لأنه سيتم التعامل معه بشكل منفصل
      if (currency !== 'USDT') {
        // إضافة الرصيد مع معدل الصرف الحالي
        const weightedAvgRate = summary.currencyCostInfo[currency]?.weightedAvgRate || 0;
        newBankBalances.push({
          currency,
          amount: balance,
          initialRate: weightedAvgRate
        });
      }
    });

    // حساب رصيد USDT النهائي بعد خصم E-Voucher
    const finalUsdtBalance = summary.currentBalances['USDT'] - eVoucherUsdtSold;
    const usdtWeightedAvgRate = summary.currencyCostInfo['USDT']?.weightedAvgRate || 3.67;

    // تصفير الصفحة وتحديث الأرصدة الجديدة
    setTransactions([]);
    setCashFlowRecords([]);
    setSummary(null);
    setError(null);
    setImportedFileName(null);
    setEVoucherSummary(null);
    setEVoucherUsdtSold(0);
    setPendingTransactions([]);
    setSuccessMessage(null);

    // تعيين الأرصدة الافتتاحية الجديدة
    setInitialBalances(newBankBalances);
    setInitialUsdtBalance(finalUsdtBalance);
    setInitialUsdtRate(usdtWeightedAvgRate);

    // تنظيف حقل الملف
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // إظهار رسالة نجاح
    setSuccessMessage('تم تصفير الصفحة وتحديث الأرصدة الافتتاحية بنجاح');
  };

  // مسح البيانات المدخلة وتصفير التبويب
  const handleClearData = () => {
    if (window.confirm('هل أنت متأكد من مسح جميع البيانات؟')) {
      setInitialBalances([{ amount: 0, currency: 'AED', initialRate: 0 }]);
      setInitialUsdtBalance(0);
      setInitialUsdtRate(3.67);
      setTransactions([]);
      setCashFlowRecords([]);
      setSummary(null);
      setError(null);
      setImportedFileName(null);
      
      // تنظيف التخزين المحلي الخاص بالتبويب إذا كنت ترغب
      localStorage.removeItem('p2pFlowInitialBalances');
      localStorage.removeItem('p2pFlowInitialUsdtBalance');
      localStorage.removeItem('p2pFlowInitialUsdtRate');
      
      // تنظيف حقل الملف
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // تنسيق القيمة المالية للعرض بدقة أكبر
  const formatCurrency = (value: number, currency: string) => {
    // للعملات المحلية، نستخدم تقريب بأكثر دقة قبل التقريب النهائي للعرض
    if (currency === 'AED') {
      // نحل مشكلة التقريب بإضافة قليل من الدقة (0.0001) لتجنب الفروقات الناتجة عن حسابات الحاسوب للأرقام العشرية
      const preciseValue = Math.round((value + 0.0001) * 10000) / 10000;
      return `${preciseValue.toFixed(4)} ${currency}`;
    }
    return `${value.toFixed(4)} ${currency}`;
  };

  const [eVoucherSummary, setEVoucherSummary] = useState<EVoucherSummaryType | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pendingTransactions, setPendingTransactions] = useState<P2PTransaction[]>([]);
  const [eVoucherUsdtSold, setEVoucherUsdtSold] = useState<number>(0);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
        {/* عنوان التبويب */}
        <h2 className="text-2xl font-bold mb-6 text-right text-gray-800">سجل التدفق النقدي P2P</h2>
        
        {/* رسالة الخطأ */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-right">
            <p>{error}</p>
          </div>
        )}
        
        {/* رسالة النجاح مع إحصائيات العمليات */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl text-right whitespace-pre-line">
            <p className="font-semibold mb-1">تمت العملية بنجاح!</p>
            <pre className="text-sm font-mono bg-white p-3 rounded-lg border border-green-100 overflow-x-auto">
              {successMessage}
            </pre>
          </div>
        )}
        
        {/* قسم إدخال الأرصدة الأولية */}
        <div className="mb-8 bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-xl font-semibold mb-4 text-right text-gray-700">الأرصدة الأولية</h3>
          
          <div className="mb-4">
            <div className="font-medium text-sm mb-2 text-right text-gray-600">أرصدة البنوك</div>
            
            {initialBalances.map((balance, index) => (
              <div key={index} className="flex flex-wrap items-center mb-3 gap-4">
                <div className="flex-grow">
                  <input
                    type="number"
                    value={balance.amount}
                    onChange={(e) => handleBankBalanceChange(index, 'amount', e.target.value)}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-right shadow-sm"
                    placeholder="أدخل المبلغ"
                    dir="rtl"
                  />
                </div>
                
                <div className="w-32">
                  <select
                    value={balance.currency}
                    onChange={(e) => handleBankBalanceChange(index, 'currency', e.target.value)}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-right shadow-sm"
                    dir="rtl"
                  >
                    <option value="AED">درهم (AED)</option>
                    <option value="EGP">جنيه (EGP)</option>
                    <option value="USD">دولار (USD)</option>
                    <option value="SAR">ريال (SAR)</option>
                  </select>
                </div>
                
                <div className="w-32">
                  <input
                    type="number"
                    value={balance.initialRate || ''}
                    onChange={(e) => handleBankBalanceChange(index, 'initialRate', e.target.value)}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-right shadow-sm"
                    placeholder="سعر الصرف"
                    dir="rtl"
                  />
                </div>
                
                <button
                  onClick={() => handleRemoveBankBalance(index)}
                  className="p-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  title="حذف"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            
            <button
              onClick={handleAddBankBalance}
              className="mt-2 flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors text-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              إضافة رصيد بنكي جديد
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="font-medium text-sm mb-2 text-right text-gray-600">رصيد USDT الأولي</div>
              <input
                type="number"
                value={initialUsdtBalance}
                onChange={(e) => handleUsdtBalanceChange(e.target.value)}
                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-right shadow-sm"
                placeholder="أدخل رصيد USDT الأولي"
                dir="rtl"
              />
            </div>
            
            <div>
              <div className="font-medium text-sm mb-2 text-right text-gray-600">سعر صرف USDT الأولي</div>
              <input
                type="number"
                value={initialUsdtRate}
                onChange={(e) => handleUsdtRateChange(e.target.value)}
                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-right shadow-sm"
                placeholder="أدخل سعر صرف USDT الأولي (مثال: 3.67)"
                dir="rtl"
              />
            </div>
          </div>
        </div>
        
        {/* قسم استيراد وتصدير البيانات */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-end gap-4">
            <label className="group inline-flex items-center justify-center px-6 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all shadow-sm hover:shadow-lg hover:shadow-indigo-100/50 space-x-3 duration-200 relative overflow-hidden backdrop-blur-sm">
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-100/0 via-indigo-100/40 to-indigo-100/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0l-3 3a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              <span className="font-medium text-sm mr-2">استيراد ملف Excel</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // استخدام دالة handleFileSelect للتعامل مع ملف Excel
                    handleFileSelect(file);
                  }
                }}
                className="hidden"
                ref={fileInputRef}
              />
            </label>
            
            <button
              onClick={handleExportExcel}
              disabled={cashFlowRecords.length === 0}
              className={`inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium transition-all duration-200 rounded-xl shadow-sm ${
                cashFlowRecords.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 border border-emerald-200'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              تصدير سجل التدفق النقدي
            </button>

            {summary && summary.currentBalances && (
              <button
                onClick={handleExportClosingBalance}
                className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium transition-all duration-200 rounded-xl shadow-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-lg hover:shadow-indigo-100/50 border border-indigo-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                تصدير رصيد الإغلاق لليوم التالي
              </button>
            )}
            
            <button
              onClick={handleClearData}
              className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium transition-all duration-200 rounded-xl shadow-sm bg-red-50 text-red-700 hover:bg-red-100 hover:shadow-lg hover:shadow-red-100/50 border border-red-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              مسح البيانات
            </button>
          </div>
          
          {loading && (
            <div className="my-6 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
            </div>
          )}
          
          {transactions.length > 0 && !loading && (
            <div className="mt-6 text-right text-green-700 font-medium">
              تم استيراد {transactions.length} عملية بنجاح
            </div>
          )}
        </div>
        
        {/* إضافة قسم E-Voucher قبل سجل التدفق النقدي */}
        {eVoucherSummary && (
          <div className="mb-8 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <h3 className="text-xl font-semibold mb-4 text-right text-gray-700">
              ملخص عمليات E-Voucher 
              {importedFileName && (
                <span className="text-sm text-gray-500 mr-2">
                  ({importedFileName})
                </span>
              )}
            </h3>
            <EVoucherSummary summary={eVoucherSummary} />
          </div>
        )}
        
        {/* قسم ملخص الإحصائيات */}
        {summary && (
          <div className="mb-8 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <h3 className="text-xl font-semibold mb-4 text-right text-gray-700">ملخص العمليات</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* إحصائيات الشراء */}
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-medium text-blue-700 mb-2 text-right">إجمالي عمليات الشراء</h4>
                <ul className="space-y-2 text-right">
                  {Object.entries(summary.totalBuy).map(([currency, amount]) => (
                    <li key={`buy-${currency}`}>
                      <span className="font-medium">{currency}: </span>
                      {formatCurrency(amount, currency)}
                      {summary.avgBuyPrice[currency] && (
                        <span className="text-sm text-gray-500 mr-2">
                          (متوسط السعر: {summary.avgBuyPrice[currency].toFixed(4)} {currency}/USDT)
                        </span>
                      )}
                    </li>
                  ))}
                  <li className="text-blue-700 font-medium">
                    USDT: {summary.totalBuyUsdt.toFixed(4)}
                  </li>
                </ul>
              </div>
              
              {/* إحصائيات البيع */}
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-medium text-green-700 mb-2 text-right">إجمالي عمليات البيع</h4>
                <ul className="space-y-2 text-right">
                  {Object.entries(summary.totalSell).map(([currency, amount]) => (
                    <li key={`sell-${currency}`}>
                      <span className="font-medium">{currency}: </span>
                      {formatCurrency(amount, currency)}
                      {summary.avgSellPrice[currency] && (
                        <span className="text-sm text-gray-500 mr-2">
                          (متوسط السعر: {summary.avgSellPrice[currency].toFixed(4)} {currency}/USDT)
                        </span>
                      )}
                    </li>
                  ))}
                  <li className="text-green-700 font-medium">
                    USDT: {summary.totalSellUsdt.toFixed(4)}
                  </li>
                </ul>
              </div>
              
              {/* الأرصدة الحالية ومتوسط التكلفة */}
              <div className="bg-white p-4 rounded-lg shadow-sm md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* الأرصدة الحالية */}
                  <div>
                    <h4 className="font-medium text-purple-700 mb-2 text-right">الأرصدة الحالية</h4>
                    <ul className="space-y-2 text-right">
                      {Object.entries(summary.currentBalances).map(([currency, balance]) => (
                        <li key={`balance-${currency}`}>
                          {currency === 'USDT' ? (
                            // خصم قيمة USDT المستخدمة في E-Voucher من الرصيد الفعلي المعروض
                            <>
                              <span className="font-medium">{formatCurrency(balance - eVoucherUsdtSold, currency)}</span>
                              {eVoucherUsdtSold > 0 && (
                                <div className="text-xs text-gray-500 flex justify-end items-center gap-1">
                                  <span>({eVoucherUsdtSold.toFixed(4)} USDT تم استخدامها في E-Voucher)</span>
                                  <span className="text-xs inline-block px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">i</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="font-medium">{formatCurrency(balance, currency)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* متوسط التكلفة - تم تعديل طريقة العرض */}
                  <div>
                    <h4 className="font-medium text-purple-700 mb-2 text-right">متوسط سعر التكلفة</h4>
                    <ul className="space-y-2 text-right">
                      {Object.entries(summary.currencyCostInfo || {}).map(([currency, costInfo]) => {
                        // نعرض فقط العملات التي لها رصيد
                        if (summary.currentBalances[currency] > 0) {
                          return (
                            <li key={`cost-${currency}`}>
                              <span className="font-medium">{currency}: </span>
                              {costInfo.weightedAvgRate.toFixed(4)} {currency === 'USDT' ? 'AED/USDT' : 'AED/USDT'}
                            </li>
                          );
                        }
                        return null;
                      })}
                    </ul>
                  </div>
                  
                  {/* الربح / الخسارة */}
                  <div>
                    <h4 className="font-medium text-purple-700 mb-2 text-right">الربح / الخسارة</h4>
                    <ul className="space-y-2 text-right">
                      {(() => {
                        // حساب الربح الفعلي من عمليات البيع والشراء
                        let totalBuyAmount = 0;  // إجمالي ما تم دفعه للشراء بالدرهم
                        let totalSellAmount = 0; // إجمالي ما تم استلامه من البيع بالدرهم
                        
                        // حساب إجمالي كميات USDT المتداولة
                        let totalBuyUsdt = summary.totalBuyUsdt;   // إجمالي كمية USDT المشتراة
                        let totalSellUsdt = summary.totalSellUsdt;  // إجمالي كمية USDT المباعة
                        
                        // حساب إجمالي مبالغ الدرهم للشراء والبيع
                        if (summary.totalBuy['AED']) {
                          totalBuyAmount = summary.totalBuy['AED'];
                        }
                        
                        if (summary.totalSell['AED']) {
                          totalSellAmount = summary.totalSell['AED'];
                        }
                        
                        // حساب الربح الفعلي بالدرهم
                        // الربح الفعلي = (مبلغ البيع) - (كمية USDT المباعة * متوسط تكلفة شراء الوحدة)
                        const actualProfit = totalSellAmount - (totalSellUsdt * (totalBuyAmount / totalBuyUsdt));
                        
                        return (
                          <>
                            <li>
                              <span className="font-medium">إجمالي مشتريات USDT: </span>
                              {totalBuyUsdt.toFixed(4)} USDT مقابل {totalBuyAmount.toFixed(4)} AED
                            </li>
                            <li>
                              <span className="font-medium">إجمالي مبيعات USDT: </span>
                              {totalSellUsdt.toFixed(4)} USDT مقابل {totalSellAmount.toFixed(4)} AED
                            </li>
                            {eVoucherUsdtSold > 0 && (
                              <li>
                                <span className="font-medium">USDT مستخدمة في E-Voucher: </span>
                                <span className="text-amber-700">{eVoucherUsdtSold.toFixed(4)} USDT</span>
                                <span className="text-xs text-gray-500 mr-1">(مخصومة من الرصيد)</span>
                              </li>
                            )}
                            {/* إضافة توضيح للرصيد المتبقي بعد خصم E-Voucher */}
                            {eVoucherUsdtSold > 0 && summary.currentBalances['USDT'] && (
                              <li>
                                <span className="font-medium">صافي رصيد USDT المتبقي: </span>
                                <span className="text-blue-700">{(summary.currentBalances['USDT'] - eVoucherUsdtSold).toFixed(4)} USDT</span>
                              </li>
                            )}
                            {totalSellUsdt > 0 && (
                              <li>
                                <span className="font-medium">تكلفة USDT المباعة: </span>
                                {((totalBuyAmount / totalBuyUsdt) * totalSellUsdt).toFixed(4)} AED
                              </li>
                            )}
                            {totalSellUsdt > 0 && (
                              <li className="mt-4 border-t pt-3">
                                <span className={`font-bold text-lg ${actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  الربح الفعلي من التداول: {Math.abs(actualProfit).toFixed(4)} AED
                                </span>
                              </li>
                            )}
                            {totalSellUsdt === 0 && (
                              <li className="text-gray-500">لم يتم بيع أي USDT بعد لحساب الربح</li>
                            )}
                          </>
                        );
                      })()}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* قسم المعاملات المعلقة - يظهر فقط عند وجود معاملات معلقة */}
        {pendingTransactions.length > 0 && summary && (
          <div className="mb-8 bg-amber-50 p-5 rounded-xl border border-amber-200">
            <h3 className="text-xl font-semibold mb-4 text-right text-amber-700">معاملات معلقة</h3>
            <p className="text-amber-700 mb-4 text-right text-sm">
              هذه المعاملات معلقة ولم تكتمل بعد. تم خصمها من الأرصدة الحالية ولكنها لم تدخل في حسابات الربح/الخسارة.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* عمليات الشراء المعلقة */}
              {pendingTransactions.filter(t => t.type === 'Buy').length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-medium text-amber-700 mb-2 text-right">مدفوعات معلقة (بانتظار وصول USDT)</h4>
                  <ul className="space-y-2 text-right">
                    {pendingTransactions
                      .filter(t => t.type === 'Buy')
                      .map((transaction, index) => (
                        <li key={`pending-buy-${index}`} className="border-b border-amber-100 pb-2">
                          <div><span className="font-medium">{transaction.reference}</span></div>
                          <div>
                            <span className="text-amber-800">تم دفع: </span>
                            {formatCurrency(transaction.realAmount, transaction.currency)}
                          </div>
                          <div>
                            <span className="text-amber-800">بانتظار: </span>
                            {formatCurrency(transaction.usdt, 'USDT')}
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              
              {/* عمليات البيع المعلقة */}
              {pendingTransactions.filter(t => t.type === 'Sell').length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-medium text-amber-700 mb-2 text-right">مبيعات معلقة (بانتظار وصول الأموال للبنك)</h4>
                  <ul className="space-y-2 text-right">
                    {pendingTransactions
                      .filter(t => t.type === 'Sell')
                      .map((transaction, index) => (
                        <li key={`pending-sell-${index}`} className="border-b border-amber-100 pb-2">
                          <div><span className="font-medium">{transaction.reference}</span></div>
                          <div>
                            <span className="text-amber-800">تم إرسال: </span>
                            {formatCurrency(transaction.usdt, 'USDT')}
                          </div>
                          <div>
                            <span className="text-amber-800">بانتظار: </span>
                            {formatCurrency(transaction.realAmount, transaction.currency)}
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              
              {/* ملخص إحصائيات المعاملات المعلقة */}
              <div className="md:col-span-2 bg-white p-4 rounded-lg shadow-sm mt-2">
                <h4 className="font-medium text-amber-700 mb-2 text-right">تأثير المعاملات المعلقة على الأرصدة</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-right text-amber-600 mb-1">أموال معلقة (خرجت من البنك)</h5>
                    {Object.entries(
                      pendingTransactions
                        .filter(t => t.type === 'Buy')
                        .reduce((acc, t) => {
                          acc[t.currency] = (acc[t.currency] || 0) + t.realAmount;
                          return acc;
                        }, {} as {[currency: string]: number})
                    ).map(([currency, amount]) => (
                      <div key={`pending-out-${currency}`} className="text-right">
                        <span className="font-medium">{currency}: </span>
                        {amount.toFixed(4)}
                      </div>
                    ))}
                  </div>
                  <div>
                    <h5 className="font-medium text-right text-amber-600 mb-1">USDT معلقة (خرجت من المنصة)</h5>
                    <div className="text-right">
                      <span className="font-medium">USDT: </span>
                      {pendingTransactions
                        .filter(t => t.type === 'Sell')
                        .reduce((sum, t) => sum + t.usdt, 0)
                        .toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* قسم سجل التدفق النقدي */}
        {cashFlowRecords.length > 0 && (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-right text-gray-700">سجل التدفق النقدي</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      التاريخ
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      النوع
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      التفاصيل
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      الأرصدة
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cashFlowRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {record.date.toLocaleString('ar-EG')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          record.type === 'Buy'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-green-50 text-green-700'
                        }`}>
                          {record.type === 'Buy' ? 'شراء' : 'بيع'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">
                        {record.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">
                        <ul className="space-y-1">
                          {Object.entries(record.balances).map(([currency, balance]) => (
                            <li key={`${record.id}-${currency}`}>
                              <span className="font-medium">{currency}: </span>
                              {formatCurrency(balance, currency)}
                              {record.costInfo[currency] && (
                                <span className="text-xs text-gray-500 mr-2">
                                  (متوسط السعر: {record.costInfo[currency].weightedAvgRate.toFixed(4)} 
                                  {currency === 'USDT' ? ' AED/USDT' : 
                                   currency === 'EGP' ? ' AED/EGP' : 
                                   ' ' + currency + '/USDT'})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* قسم إحصائيات المعاملات */}
        {transactions.length > 0 && (
          <div className="my-8 bg-green-50 border border-green-100 p-5 rounded-xl">
            <h3 className="text-xl font-semibold mb-4 text-right text-green-800">
              إحصائيات المعاملات
              {importedFileName && (
                <span className="text-sm text-gray-500 mr-2">
                  ({importedFileName})
                </span>
              )}
            </h3>
            <div className="overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-green-100">
                    <th className="border border-green-200 p-2 text-right">نوع المعاملة</th>
                    <th className="border border-green-200 p-2 text-center">إجمالي</th>
                    <th className="border border-green-200 p-2 text-center">مكتملة</th>
                    <th className="border border-green-200 p-2 text-center">ملغاة</th>
                    <th className="border border-green-200 p-2 text-center">معلقة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-green-200 p-2 text-right font-medium">P2P</td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'P2P').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'P2P' && t.status === 'COMPLETED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'P2P' && t.status === 'CANCELLED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'P2P' && t.status === 'PENDING').length}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-green-200 p-2 text-right font-medium">E-Voucher</td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'E-Voucher').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'COMPLETED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'CANCELLED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center">
                      {transactions.filter(t => t.tradeType === 'E-Voucher' && t.status === 'PENDING').length}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-green-100">
                    <td className="border border-green-200 p-2 text-right font-bold">الإجمالي</td>
                    <td className="border border-green-200 p-2 text-center font-bold">
                      {transactions.length}
                    </td>
                    <td className="border border-green-200 p-2 text-center font-bold">
                      {transactions.filter(t => t.status === 'COMPLETED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center font-bold">
                      {transactions.filter(t => t.status === 'CANCELLED').length}
                    </td>
                    <td className="border border-green-200 p-2 text-center font-bold">
                      {transactions.filter(t => t.status === 'PENDING').length}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 