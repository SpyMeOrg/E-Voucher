import React, { useState } from 'react';
import { read, utils } from 'xlsx';
import { exportToExcel } from './utils/excelExport';
import { BinanceTab } from './features/binance/components/BinanceTab';
import { AveragePriceTab } from './features/average-price/components/AveragePriceTab';
import { BatchAnalyzerTab } from './features/batch-analyzer/components/BatchAnalyzerTab';

interface CalculationResult {
  totalEGP: number;
  totalAED: number;
  repurchaseCost: number;
  merchantFee: number;
  netProfit: number;
  profitPercentage: number;
  requiredUSDT: number;
  companyProfitPercentage: number;
}

// واجهة البيانات المستوردة
interface ImportedRow {
  Reference: string;
  Created: string;
  'Mobile Number': string;
  Amount: string;
  'Voucher Amount': string;
  Rate: string;
  Status: string;
}

export default function App() {
  const [amounts, setAmounts] = useState<string>('');
  const [usdtEGPRate, setUsdtEGPRate] = useState<string>('');
  const [aedEGPRate, setAedEGPRate] = useState<string>('');
  const [usdtAEDRate, setUsdtAEDRate] = useState<string>('');
  const [merchantFeeRate, setMerchantFeeRate] = useState<string>('');
  const [result, setResult] = useState<CalculationResult | null>(null);
  // إضافة حالة لتخزين البيانات المستوردة
  const [importedData, setImportedData] = useState<ImportedRow[]>([]);
  const [activeTab, setActiveTab] = useState<'calculator' | 'binance' | 'average-price' | 'batch-analyzer'>('calculator');

  const calculateResults = () => {
    // التحقق من وجود مبالغ مدخلة فقط
    if (!amounts) return null;

    const lines = amounts.split('\n').filter(line => line.trim() !== '');
    const values = lines.map(line => parseFloat(line.replace(/,/g, '')));
    const validValues = values.filter(val => !isNaN(val));

    if (validValues.length === 0) {
      return {
        totalEGP: 0,
        totalAED: 0,
        count: 0
      };
    }

    const totalEGP = validValues.reduce((sum, val) => sum + val, 0);
    // تعديل معادلة حساب إجمالي الدراهم المطلوبة
    const totalAED = aedEGPRate ? totalEGP / parseFloat(aedEGPRate) : 0;

    const requiredUSDT = totalEGP / parseFloat(usdtEGPRate);
    const repurchaseCost = requiredUSDT * parseFloat(usdtAEDRate);
    // حساب عمولة التاجر
    const merchantFeeEGP = requiredUSDT * parseFloat(merchantFeeRate);
    const merchantFeeValue = merchantFeeEGP / parseFloat(usdtEGPRate);
    const netProfit = totalAED - repurchaseCost - merchantFeeValue;
    // نسبة الربح = (عمولة التاجر + صافي الربح) / تكلفة إعادة الشراء × 100
    const profitPercentage = ((merchantFeeValue + netProfit) / repurchaseCost) * 100;
    // نسبة ربح الشركة = صافي الربح / إجمالي الدراهم المطلوبة × 100
    const companyProfitPercentage = (netProfit / repurchaseCost) * 100;

    setResult({
      totalEGP,
      totalAED,
      repurchaseCost,
      merchantFee: merchantFeeValue,
      netProfit,
      profitPercentage,
      requiredUSDT,
      companyProfitPercentage
    });

    return {
      totalEGP,
      totalAED,
      count: validValues.length
    };
  };

  // دالة للبحث عن أعمدة المبالغ وتصنيفها
  const findAmountColumns = (data: any[]) => {
    if (!data || data.length === 0) return { largerAmountCol: null, smallerAmountCol: null, rateCol: null };

    const headers = Object.keys(data[0]);
    
    // البحث عن عمود سعر الصرف (درهم/مصري)
    const rateCol = headers.find(key => {
      const lower = key.toLowerCase();
      return (
        (lower.includes('aed') && lower.includes('egp')) ||
        (lower.includes('درهم') && lower.includes('مصري')) ||
        (lower.includes('درهم') && lower.includes('جنيه')) ||
        (lower.includes('rate') && !lower.includes('usdt'))
      );
    });

    // البحث عن الأعمدة التي تحتوي على "amount" أو "مبلغ"
    const amountColumns = headers.filter(key => {
      const lower = key.toLowerCase();
      return lower.includes('amount') || lower.includes('مبلغ');
    });

    let largerAmountCol = null;
    let smallerAmountCol = null;

    if (amountColumns.length === 1) {
      largerAmountCol = amountColumns[0];
    } else if (amountColumns.length >= 2) {
      // حساب متوسط المبالغ في كل عمود
      const averages = amountColumns.map(col => ({
        column: col,
        average: data.reduce((sum, row) => {
          const val = parseFloat(row[col]?.toString().replace(/,/g, '') || '0');
          return sum + (isNaN(val) ? 0 : val);
        }, 0) / data.length
      }));

      // ترتيب تنازلي - الأكبر للمصري والأصغر للدرهم
      averages.sort((a, b) => b.average - a.average);
      largerAmountCol = averages[0].column;
      smallerAmountCol = averages[1]?.column || null;
    }

    return { 
      egyptianCol: largerAmountCol,  // العمود ذو المبالغ الأكبر للمصري
      aedCol: smallerAmountCol,      // العمود ذو المبالغ الأصغر للدرهم
      rateCol 
    };
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // تنظيف البيانات القديمة
      setImportedData([]);
      setAmounts('');
      setResult(null);

      // قراءة الملف
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      try {
        const workbook = read(data, { type: 'array' });
        
        if (!workbook.SheetNames.length) {
          alert('الملف لا يحتوي على أي بيانات');
          return;
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = utils.sheet_to_json(firstSheet);

        if (!Array.isArray(rawData) || !rawData.length) {
          alert('لا توجد بيانات في الملف');
          return;
        }

        // البحث عن الأعمدة
        const { egyptianCol, aedCol, rateCol } = findAmountColumns(rawData);

        if (!egyptianCol) {
          alert('لم يتم العثور على عمود المبلغ المصري في الملف');
          return;
        }

        // تحويل البيانات
        const processedData: ImportedRow[] = rawData.map((row: any) => {
          // البحث عن التاريخ والوقت
          const dateValue = Object.entries(row).find(([key]) => 
            key.toLowerCase().includes('date') || 
            key.toLowerCase().includes('created') ||
            key.toLowerCase().includes('تاريخ')
          )?.[1]?.toString() || '';

          // البحث عن الرقم المرجعي
          const referenceValue = Object.entries(row).find(([key]) => 
            key.toLowerCase().includes('reference') || 
            key.toLowerCase().includes('ref') ||
            key.toLowerCase().includes('مرجع')
          )?.[1]?.toString() || '';

          // البحث عن رقم الموبايل
          const mobileValue = Object.entries(row).find(([key]) => 
            key.toLowerCase().includes('mobile') || 
            key.toLowerCase().includes('phone') ||
            key.toLowerCase().includes('موبايل') ||
            key.toLowerCase().includes('هاتف')
          )?.[1]?.toString() || '';

          return {
            Reference: referenceValue,
            Created: dateValue,
            'Mobile Number': mobileValue,
            Amount: aedCol ? row[aedCol]?.toString() || '' : '',
            'Voucher Amount': row[egyptianCol]?.toString() || '',
            Rate: rateCol ? row[rateCol]?.toString() || '' : '',
            Status: row['Status']?.toString() || ''
          };
        });

        // تنقية البيانات من صفوف الإجمالي
        const jsonData = processedData.filter(row => {
          const reference = String(row.Reference || '').toLowerCase();
          return !reference.includes('total') && 
                 !reference.includes('الإجمالي') &&
                 !reference.includes('اجمالي') &&
                 !reference.includes('المجموع');
        });

        setImportedData(jsonData);

        // تحديث حقل الإدخال بالمبالغ المصرية
        const amounts = jsonData
          .map(row => row['Voucher Amount'])
          .filter(amount => amount && !isNaN(parseFloat(amount)));

        if (amounts.length > 0) {
          setAmounts(amounts.join('\n'));
        } else {
          alert('لم يتم العثور على مبالغ صحيحة في الملف');
        }
      } catch (error) {
        console.error('خطأ في قراءة الملف:', error);
        alert('حدث خطأ أثناء قراءة الملف');
      }
    } catch (error) {
      console.error('خطأ في معالجة الملف:', error);
      alert('حدث خطأ أثناء معالجة الملف');
    }
    
    // تنظيف حقل الملف
    event.target.value = '';
  };

  const handleExport = () => {
    if (amounts) {
      const manualData: ImportedRow[] = amounts.split('\n')
        .map((amount, index) => ({
          Reference: `MANUAL-${index + 1}`,
          Created: new Date().toISOString(),
          'Mobile Number': '',
          Amount: '',
          'Voucher Amount': amount.trim(),
          Rate: aedEGPRate,
          Status: ''
        }));
      exportToExcel(amounts, importedData.length > 0 ? importedData : manualData, usdtEGPRate);
    }
  };

  const handleClearMemory = () => {
    setImportedData([]);
    setAmounts('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8">
      <div className="relative mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3">
            نظام E-Voucher للتحويلات المالية
          </h1>
          <div className="max-w-3xl mx-auto">
            <p className="text-xl text-gray-600 leading-relaxed mb-4">
              منصة متكاملة لإدارة التحويلات المالية وتداول العملات الرقمية
            </p>
          </div>
        </div>
        
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex justify-center -mb-px space-x-8 rtl:space-x-reverse">
              <button
                onClick={() => setActiveTab('calculator')}
                className={`border-b-2 ${activeTab === 'calculator' ? 'border-blue-500 py-4 px-1 text-sm font-medium text-blue-600' : 'border-transparent py-4 px-1 text-sm font-medium text-gray-600 hover:text-blue-600'} whitespace-nowrap`}
              >
                حساب الأرباح من التحويلات بين الدول
              </button>
              <button
                onClick={() => setActiveTab('binance')}
                className={`border-b-2 ${activeTab === 'binance' ? 'border-blue-500 py-4 px-1 text-sm font-medium text-blue-600' : 'border-transparent py-4 px-1 text-sm font-medium text-gray-600 hover:text-blue-600'} whitespace-nowrap`}
              >
                Binance
              </button>
              <button
                onClick={() => setActiveTab('average-price')}
                className={`border-b-2 ${activeTab === 'average-price' ? 'border-blue-500 py-4 px-1 text-sm font-medium text-blue-600' : 'border-transparent py-4 px-1 text-sm font-medium text-gray-600 hover:text-blue-600'} whitespace-nowrap`}
              >
                حساب متوسط السعر
              </button>
              <button
                onClick={() => setActiveTab('batch-analyzer')}
                className={`border-b-2 ${activeTab === 'batch-analyzer' ? 'border-blue-500 py-4 px-1 text-sm font-medium text-blue-600' : 'border-transparent py-4 px-1 text-sm font-medium text-gray-600 hover:text-blue-600'} whitespace-nowrap`}
              >
                تحليل ملفات متعددة
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'calculator' ? (
          <div className="relative bg-white backdrop-blur-sm bg-opacity-90 shadow-2xl rounded-2xl p-4 sm:p-8 lg:p-12 mx-auto border border-gray-100 mb-8">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* قسم الإدخال - يمين */}
                <div className="flex flex-col h-full space-y-6">
                  <div>
                    <div className="relative">
                      <label className="block text-lg font-semibold text-gray-700 text-right mb-3">
                        المبالغ بالجنيه المصري
                      </label>
                      <textarea
                        value={amounts}
                        onChange={(e) => setAmounts(e.target.value)}
                        className="w-full h-32 sm:h-36 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all text-right shadow-sm resize-none"
                        placeholder="أدخل المبالغ هنا (كل مبلغ في سطر جديد)"
                        dir="rtl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2 text-right">
                        سعر USDT/EGP
                      </label>
                      <input
                        type="number"
                        placeholder="مثال: 51.85"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all text-right shadow-sm"
                        value={usdtEGPRate}
                        onChange={(e) => setUsdtEGPRate(e.target.value)}
                        dir="rtl"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2 text-right">
                        سعر AED/EGP
                      </label>
                      <input
                        type="number"
                        placeholder="مثال: 13.72"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all text-right shadow-sm"
                        value={aedEGPRate}
                        onChange={(e) => setAedEGPRate(e.target.value)}
                        dir="rtl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2 text-right">
                        سعر USDT/AED
                      </label>
                      <input
                        type="number"
                        placeholder="مثال: 3.67"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all text-right shadow-sm"
                        value={usdtAEDRate}
                        onChange={(e) => setUsdtAEDRate(e.target.value)}
                        dir="rtl"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2 text-right">
                        عمولة التاجر بالجنية
                      </label>
                      <input
                        type="number"
                        placeholder=" مثال 0.15 "
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all text-right shadow-sm"
                        value={merchantFeeRate}
                        onChange={(e) => setMerchantFeeRate(e.target.value)}
                        dir="rtl"
                      />
                    </div>
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="flex items-center justify-center gap-4">
                      <label className="group flex-1 inline-flex items-center justify-center px-6 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm hover:shadow-lg hover:shadow-blue-100/50 space-x-3 duration-200 relative overflow-hidden backdrop-blur-sm">
                        <span className="absolute inset-0 bg-gradient-to-r from-blue-100/0 via-blue-100/40 to-blue-100/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0l-3 3a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium text-sm">رفع ملف Excel</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleExcelUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        onClick={calculateResults}
                        className="group flex-1 relative inline-flex items-center justify-center px-6 py-3.5 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-2xl font-medium hover:from-violet-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all text-sm shadow-md hover:shadow-lg hover:shadow-indigo-200/50 duration-200 overflow-hidden"
                      >
                        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
                        <span className="relative inline-flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          حساب النتائج
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* قسم النتائج - يسار */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 rounded-2xl shadow-lg flex flex-col h-full border border-gray-100">
                  {result ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">إجمالي المبلغ (جنيه)</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.totalEGP.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">كمية USDT المطلوبة</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.requiredUSDT.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">إجمالي الدراهم المطلوبة</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.totalAED.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">تكلفة إعادة الشراء (درهم)</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.repurchaseCost.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">عمولة التاجر (USDT)</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.merchantFee.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1">صافي الربح (درهم)</div>
                        <div className="text-lg sm:text-xl font-bold text-gray-900">{result.netProfit.toFixed(2)}</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1 text-green-800 font-bold">نسبة الربح النهائية</div>
                        <div className="text-lg sm:text-xl font-bold text-green-800">{result.profitPercentage.toFixed(2)}%</div>
                      </div>

                      <div className="text-right bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="text-gray-500 text-sm mb-1 text-blue-800 font-bold">نسبة ربح الشركة</div>
                        <div className="text-lg sm:text-xl font-bold text-blue-800">{result.companyProfitPercentage.toFixed(2)}%</div>
                      </div>

                      <div className="mt-4 col-span-2">
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={handleExport}
                            className="group relative flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-emerald-200 text-emerald-600 rounded-2xl hover:bg-emerald-50 transition-all shadow-sm hover:shadow-lg hover:shadow-emerald-100/50 duration-200 overflow-hidden"
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-emerald-100/0 via-emerald-100/40 to-emerald-100/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0l-3 3a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium text-sm">تصدير إلى Excel</span>
                          </button>

                          <button
                            onClick={handleClearMemory}
                            className="group relative flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-2xl hover:bg-rose-50 transition-all shadow-sm hover:shadow-lg hover:shadow-rose-100/50 duration-200 overflow-hidden"
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-rose-100/0 via-rose-100/40 to-rose-100/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-500 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium text-sm">مسح الذاكرة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 sm:h-16 w-12 sm:w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                        </svg>
                        <p className="text-base sm:text-lg">النتائج ستظهر هنا بعد الحساب</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'binance' ? (
          <BinanceTab />
        ) : activeTab === 'average-price' ? (
          <AveragePriceTab />
        ) : (
          <BatchAnalyzerTab />
        )}
      </div>

      {/* زر الواتساب */}
      <div className="fixed bottom-6 left-6">
        <a
          href="https://wa.me/+201015415601"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 bg-white hover:bg-green-50 text-green-600 px-5 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-green-200 hover:border-green-300 relative overflow-hidden backdrop-blur-sm"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-green-100/0 via-green-100/50 to-green-100/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></span>
          <svg className="w-6 h-6 transform group-hover:scale-110 transition-transform duration-200" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="font-medium text-sm relative">تواصل معنا على واتساب</span>
          <div className="absolute -top-1 -right-1 w-3 h-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </div>
        </a>
      </div>
    </div>
  );
}