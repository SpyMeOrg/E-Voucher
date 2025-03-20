import React, { useState, useEffect, useRef } from 'react';
import { PriceEntry, PriceSummary } from '../types/types';
import * as XLSX from 'xlsx';

export const AveragePriceTab: React.FC = () => {
    const [entries, setEntries] = useState<PriceEntry[]>(() => {
        // استرجاع البيانات المحفوظة عند تحميل المكون
        const savedEntries = localStorage.getItem('averagePriceEntries');
        return savedEntries ? JSON.parse(savedEntries) : [];
    });
    const [summary, setSummary] = useState<PriceSummary>({
        totalAmount: 0,
        totalUsdt: 0,
        averagePrice: 0
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // إضافة مدخل جديد
    const handleAddEntry = () => {
        const newEntries = [...entries, {
            amount: 0,
            usdtAmount: 0,
            price: 0
        }];
        setEntries(newEntries);
        localStorage.setItem('averagePriceEntries', JSON.stringify(newEntries));
    };

    // حذف مدخل
    const handleDeleteEntry = (index: number) => {
        const newEntries = entries.filter((_, i) => i !== index);
        setEntries(newEntries);
        localStorage.setItem('averagePriceEntries', JSON.stringify(newEntries));
    };

    // تحديث قيمة مدخل
    const handleEntryChange = (index: number, field: keyof PriceEntry, value: number) => {
        const newEntries = [...entries];
        const entry = { ...newEntries[index] };

        if (field === 'amount' || field === 'usdtAmount') {
            entry[field] = value;
            // حساب السعر تلقائياً
            if (entry.usdtAmount > 0) {
                entry.price = entry.amount / entry.usdtAmount;
            } else {
                entry.price = 0;
            }
        }

        newEntries[index] = entry;
        setEntries(newEntries);
        localStorage.setItem('averagePriceEntries', JSON.stringify(newEntries));
    };

    // دالة للتعرف على عمود كمية اليوزد
    const findUsdtColumn = (headers: string[]): string | null => {
        // البحث عن عمود USDT بدون إضافات
        const exactUsdtColumn = headers.find(header => 
            header.toLowerCase() === 'usdt'
        );
        
        // إذا وجدنا عمود USDT بدون إضافات، نستخدمه
        if (exactUsdtColumn) {
            return exactUsdtColumn;
        }

        // إذا لم نجد، نبحث عن أي عمود يحتوي على USDT
        const usdtKeywords = [
            'usdt', 'يوزد', 'دولار', 'usd', 'dollar', 'tether', 'crypto',
            'digital', 'currency', 'عملة', 'رقمية', 'كمية'
        ];
        
        return headers.find(header => 
            usdtKeywords.some(keyword => 
                header.toLowerCase().includes(keyword.toLowerCase())
            )
        ) || null;
    };

    // دالة للتعرف على عمود المبلغ بالجنيه
    const findAmountColumn = (headers: string[], data: any[]): string | null => {
        // البحث عن كل الأعمدة التي تحتوي على كلمة amount
        const amountColumns = headers.filter(header =>
            header.toLowerCase().includes('amount')
        );

        // إذا وجدنا أكثر من عمود يحتوي على amount
        if (amountColumns.length > 1) {
            // نقرأ أول صف من البيانات للمقارنة
            const firstRow = data[1];
            let maxAmount = -1;
            let selectedColumn = null;

            for (const column of amountColumns) {
                const columnIndex = headers.indexOf(column);
                const value = parseFloat(firstRow[columnIndex]);
                if (!isNaN(value) && value > maxAmount) {
                    maxAmount = value;
                    selectedColumn = column;
                }
            }

            if (selectedColumn) {
                return selectedColumn;
            }
        }

        // إذا لم نجد عمودين بكلمة amount، نستخدم البحث العادي
        const amountKeywords = [
            'جنيه', 'مصري', 'egp', 'voucher', 'egyptian', 'amount', 'مبلغ', 'vodafone',
            'المبلغ', 'فودافون', 'القيمة', 'value', 'price'
        ];
        
        return headers.find(header => 
            amountKeywords.some(keyword => 
                header.toLowerCase().includes(keyword.toLowerCase())
            )
        ) || null;
    };

    // استيراد البيانات من ملف Excel
    const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (jsonData.length < 2) {
                alert('الملف فارغ أو لا يحتوي على بيانات كافية');
                return;
            }

            // استخراج أسماء الأعمدة
            const headers = jsonData[0] as string[];
            const amountColumn = findAmountColumn(headers, jsonData);
            const usdtColumn = findUsdtColumn(headers);

            if (!amountColumn || !usdtColumn) {
                alert('لم يتم العثور على الأعمدة المطلوبة في الملف');
                return;
            }

            // تحويل البيانات
            const amountIndex = headers.indexOf(amountColumn);
            const usdtIndex = headers.indexOf(usdtColumn);

            const newEntries: PriceEntry[] = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i] as any[];
                if (!row[amountIndex] || !row[usdtIndex]) continue;

                // تجاهل صف التوتال
                const rowValues = Object.values(row).map(val => String(val).toLowerCase());
                if (rowValues.some(val => val.includes('total') || val.includes('توتال') || val.includes('اجمالي') || val.includes('إجمالي'))) {
                    continue;
                }

                const amount = parseFloat(row[amountIndex]);
                const usdtAmount = parseFloat(row[usdtIndex]);

                if (isNaN(amount) || isNaN(usdtAmount)) continue;

                newEntries.push({
                    amount,
                    usdtAmount,
                    price: usdtAmount > 0 ? amount / usdtAmount : 0
                });
            }

            if (newEntries.length === 0) {
                alert('لم يتم العثور على بيانات صالحة في الملف');
                return;
            }

            setEntries(newEntries);
            localStorage.setItem('averagePriceEntries', JSON.stringify(newEntries));
            alert(`تم استيراد ${newEntries.length} عملية بنجاح`);
        } catch (error) {
            console.error('خطأ في استيراد الملف:', error);
            alert('حدث خطأ أثناء استيراد الملف');
        }

        // تنظيف حقل الملف
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // تصدير البيانات إلى ملف Excel
    const exportToExcel = () => {
        const data = entries.map((entry, index) => ({
            'No.': (index + 1).toString(),
            'Amount (EGP)': entry.amount,
            'USDT Amount': entry.usdtAmount,
            'Price': entry.price.toFixed(2)
        }));

        // إضافة صف المجاميع
        data.push({
            'No.': 'Total',
            'Amount (EGP)': summary.totalAmount,
            'USDT Amount': summary.totalUsdt,
            'Price': summary.averagePrice.toFixed(2)
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'USDT Prices');
        XLSX.writeFile(wb, 'usdt_prices.xlsx');
    };

    // حساب الملخص
    useEffect(() => {
        const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
        const totalUsdt = entries.reduce((sum, entry) => sum + entry.usdtAmount, 0);
        const averagePrice = totalUsdt > 0 ? totalAmount / totalUsdt : 0;

        setSummary({
            totalAmount,
            totalUsdt,
            averagePrice
        });
    }, [entries]);

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <h2 className="text-xl font-bold mb-4 text-right text-gray-800">حساب متوسط سعر اليوزد</h2>
            
            {/* جدول المدخلات */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-center text-sm font-semibold text-gray-600">المبلغ بالجنيه</th>
                            <th className="px-4 py-2 text-center text-sm font-semibold text-gray-600">كمية اليوزد</th>
                            <th className="px-4 py-2 text-center text-sm font-semibold text-gray-600">السعر</th>
                            <th className="px-4 py-2 text-center text-sm font-semibold text-gray-600">حذف</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {entries.map((entry, index) => (
                            <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        value={entry.amount || ''}
                                        onChange={(e) => handleEntryChange(index, 'amount', parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base font-medium bg-gray-50 hover:bg-white"
                                        placeholder="0.00"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        value={entry.usdtAmount || ''}
                                        onChange={(e) => handleEntryChange(index, 'usdtAmount', parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base font-medium bg-gray-50 hover:bg-white"
                                        placeholder="0.00"
                                    />
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <div className="bg-gray-50 py-2 px-3 rounded-lg border border-gray-200">
                                        <span className="text-base font-bold text-gray-700">
                                            {entry.price.toFixed(2)}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <button
                                        onClick={() => handleDeleteEntry(index)}
                                        className="text-red-600 hover:text-red-800 transition-colors duration-150 p-1.5 hover:bg-red-50 rounded"
                                    >
                                        ❌
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* أزرار التحكم العلوية */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded hover:bg-indigo-100 transition-colors duration-200 flex items-center gap-2 border border-indigo-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        استيراد من Excel
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportExcel}
                        className="hidden"
                    />
                    <button
                        onClick={exportToExcel}
                        className="bg-green-50 text-green-600 px-4 py-2 rounded hover:bg-green-100 transition-colors duration-200 flex items-center gap-2 border border-green-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        تصدير إلى Excel
                    </button>
                </div>
                
                <button
                    onClick={handleAddEntry}
                    className="bg-blue-50 text-blue-600 px-4 py-2 rounded hover:bg-blue-100 transition-colors duration-200 flex items-center gap-2 border border-blue-200"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    إضافة عملية جديدة
                </button>
            </div>

            {/* ملخص الحسابات */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-700 mb-1">إجمالي المبلغ بالجنيه</h3>
                    <p className="text-2xl font-bold text-blue-800">{summary.totalAmount.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <h3 className="text-sm font-semibold text-green-700 mb-1">إجمالي اليوزد</h3>
                    <p className="text-2xl font-bold text-green-800">{summary.totalUsdt.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h3 className="text-sm font-semibold text-purple-700 mb-1">متوسط السعر</h3>
                    <p className="text-2xl font-bold text-purple-800">{summary.averagePrice.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
}; 