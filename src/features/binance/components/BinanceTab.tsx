import React, { useState, useEffect } from 'react';
import { BinanceService, P2POrderParams } from '../services/binanceService';
import { BinanceOrder, SavedCredential } from '../types/orders';
import * as XLSX from 'xlsx';

export const BinanceTab: React.FC = () => {
    const [orders, setOrders] = useState<BinanceOrder[]>([]);
    const [filteredOrders, setFilteredOrders] = useState<BinanceOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState(() => {
        return localStorage.getItem('binanceApiKey') || '';
    });
    const [secretKey, setSecretKey] = useState(() => {
        return localStorage.getItem('binanceSecretKey') || '';
    });
    const [startDate, setStartDate] = useState<string>(() => {
        return localStorage.getItem('binanceStartDate') || '';
    });
    const [endDate, setEndDate] = useState<string>(() => {
        return localStorage.getItem('binanceEndDate') || '';
    });
    const [orderType, setOrderType] = useState<'ALL' | 'BUY' | 'SELL'>(() => {
        return (localStorage.getItem('binanceOrderType') as 'ALL' | 'BUY' | 'SELL') || 'ALL';
    });
    const [orderStatus, setOrderStatus] = useState<'ALL' | 'COMPLETED' | 'CANCELLED'>(() => {
        return (localStorage.getItem('binanceOrderStatus') as 'ALL' | 'COMPLETED' | 'CANCELLED') || 'ALL';
    });
    const [orderFeeType, setOrderFeeType] = useState<'ALL' | 'MAKER' | 'TAKER'>(() => {
        return (localStorage.getItem('binanceOrderFeeType') as 'ALL' | 'MAKER' | 'TAKER') || 'ALL';
    });
    const [savedCredentials, setSavedCredentials] = useState<SavedCredential[]>([]);
    const [credentialName, setCredentialName] = useState<string>('');
    const [selectedCredential, setSelectedCredential] = useState<string>('');
    const [showSaveForm, setShowSaveForm] = useState<boolean>(false);
    
    // إضافة حالة جديدة للتحكم في ظهور قسم الفلترة
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [fetchingData, setFetchingData] = useState<boolean>(false);
    
    // إضافة المتغيرات الجديدة للتنقل بين الصفحات واسترجاع البيانات القديمة
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(50);
    const [hasMoreData, setHasMoreData] = useState<boolean>(true);
    const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(() => {
        const saved = localStorage.getItem('binanceAvailableCurrencies');
        return saved ? JSON.parse(saved) : [];
    });
    const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
        return localStorage.getItem('binanceSelectedCurrency') || 'ALL';
    });

    // مسح البيانات عند تحميل المكون مع الاحتفاظ بحالة الاتصال إذا كانت موجودة
    useEffect(() => {
        setOrders([]);
        setFilteredOrders([]);
        // لا نقوم بتغيير isConnected لأننا نريد الاحتفاظ بحالة الاتصال
    }, []);

    useEffect(() => {
        localStorage.setItem('binanceApiKey', apiKey);
        localStorage.setItem('binanceSecretKey', secretKey);
        localStorage.setItem('binanceStartDate', startDate);
        localStorage.setItem('binanceEndDate', endDate);
        localStorage.setItem('binanceOrderType', orderType);
        localStorage.setItem('binanceOrderStatus', orderStatus);
        localStorage.setItem('binanceOrderFeeType', orderFeeType);
    }, [apiKey, secretKey, startDate, endDate, orderType, orderStatus, orderFeeType]);

    // استرجاع المفاتيح المحفوظة عند تحميل المكون
    useEffect(() => {
        const savedCreds = localStorage.getItem('binanceCredentials');
        if (savedCreds) {
            try {
                const parsed = JSON.parse(savedCreds);
                setSavedCredentials(parsed);
            } catch (err) {
                console.error('خطأ في قراءة المفاتيح المحفوظة:', err);
            }
        }
    }, []);

    // حفظ العملة المختارة في التخزين المحلي
    useEffect(() => {
        localStorage.setItem('binanceSelectedCurrency', selectedCurrency);
    }, [selectedCurrency]);

    // حفظ العملات المتاحة في التخزين المحلي
    useEffect(() => {
        localStorage.setItem('binanceAvailableCurrencies', JSON.stringify(availableCurrencies));
    }, [availableCurrencies]);

    // حفظ المفاتيح الحالية
    const handleSaveCredential = () => {
        if (!credentialName || !apiKey || !secretKey) {
            setError('الرجاء إدخال الاسم والمفاتيح');
            return;
        }

        // التحقق من عدم وجود اسم مكرر
        if (savedCredentials.some(cred => cred.name === credentialName)) {
            setError('يوجد مفتاح محفوظ بهذا الاسم بالفعل');
            return;
        }

        const newCredential: SavedCredential = {
            name: credentialName,
            apiKey,
            secretKey
        };

        const updatedCredentials = [...savedCredentials, newCredential];
        setSavedCredentials(updatedCredentials);
        localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
        
        setCredentialName('');
        setShowSaveForm(false);
        setError(null);
    };

    // حذف مفتاح محفوظ
    const handleDeleteCredential = (name: string) => {
        const updatedCredentials = savedCredentials.filter(cred => cred.name !== name);
        setSavedCredentials(updatedCredentials);
        localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
        
        if (selectedCredential === name) {
            setSelectedCredential('');
        }
    };

    // اختيار مفتاح محفوظ
    const handleSelectCredential = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = e.target.value;
        setSelectedCredential(selected);
        
        if (selected) {
            const credential = savedCredentials.find(cred => cred.name === selected);
            if (credential) {
                setApiKey(credential.apiKey);
                setSecretKey(credential.secretKey);
            }
        }
    };

    // تعديل دالة الاتصال
    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey || !secretKey) {
            setError('الرجاء إدخال المفاتيح');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const service = new BinanceService(apiKey, secretKey);
            await service.checkServerTime();
            setIsConnected(true);
            // لا نقوم بتصفير الأوردرات عند الاتصال
        } catch (err) {
            console.error('خطأ في الاتصال:', err);
            setError(err instanceof Error ? err.message : 'حدث خطأ في الاتصال مع Binance');
            setIsConnected(false);
        } finally {
            setLoading(false);
        }
    };

    // تعديل دالة جلب البيانات لاستخدام المعلمات الجديدة
    const handleFetchData = async (resetPage: boolean = true) => {
        if (!apiKey || !secretKey) {
            setError('الرجاء إدخال المفاتيح');
            return;
        }

        setFetchingData(true);
        setError(null);
        
        // إعادة تعيين الصفحة إذا كان البحث جديدًا
        if (resetPage) {
            setCurrentPage(1);
            setHasMoreData(true);
        }

        try {
            const service = new BinanceService(apiKey, secretKey);
            
            // زيادة عدد الصفوف المطلوبة لتعويض الفلترة
            const adjustedRowsCount = Math.ceil(rowsPerPage * 1.5);
            
            const params: P2POrderParams = {
                page: resetPage ? 1 : currentPage,
                rows: adjustedRowsCount
            };
            
            // إضافة معلمات التاريخ إذا تم تحديدها
            if (startDate) {
                const startDateTime = new Date(startDate);
                startDateTime.setHours(0, 0, 0, 0);
                params.startTime = startDateTime.getTime();
            }
            
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                params.endTime = endDateTime.getTime();
            }
            
            // إضافة نوع الأوردر إذا تم تحديده
            if (orderType !== 'ALL') {
                params.tradeType = orderType;
            }
            
            console.log('معلمات الاستعلام:', params);
            
            const fetchedOrders = await service.getP2POrders(params);
            console.log('تم جلب الأوردرات:', fetchedOrders);
            
            // تطبيق الفلترة على النتائج الجديدة
            const filtered = applyLocalFilters(fetchedOrders);

            // التأكد من أن لدينا العدد المطلوب من النتائج بعد الفلترة
            const hasEnoughResults = filtered.length >= rowsPerPage;
            setHasMoreData(hasEnoughResults);
            
            if (resetPage) {
                // إذا كان بحثاً جديداً، نستبدل كل البيانات
                setOrders(fetchedOrders);
                setFilteredOrders(filtered);
                
                // تحديث قائمة العملات المتاحة
                const uniqueCurrencies = Array.from(new Set(fetchedOrders.map(order => order.fiatCurrency)));
                setAvailableCurrencies(prev => {
                    const newCurrencies = [...new Set([...prev, ...uniqueCurrencies])];
                    return newCurrencies.sort();
                });
            } else {
                // إذا كان تحميلاً للمزيد، نضيف البيانات الجديدة
                setOrders(prevOrders => {
                    // تأكد من عدم تكرار الأوردرات
                    const newOrders = fetchedOrders.filter(newOrder => 
                        !prevOrders.some(oldOrder => oldOrder.orderId === newOrder.orderId)
                    );
                    return [...prevOrders, ...newOrders];
                });
                
                setFilteredOrders(prev => {
                    // تأكد من عدم تكرار الأوردرات في القائمة المفلترة
                    const newFiltered = filtered.filter(newOrder => 
                        !prev.some(oldOrder => oldOrder.orderId === newOrder.orderId)
                    );
                    return [...prev, ...newFiltered];
                });
            }
            
        } catch (err) {
            console.error('خطأ في جلب البيانات:', err);
            setError(err instanceof Error ? err.message : 'حدث خطأ في جلب البيانات من Binance');
        } finally {
            setFetchingData(false);
        }
    };

    // دالة جديدة لتحميل المزيد من البيانات
    const handleLoadMore = () => {
        setCurrentPage(prev => prev + 1);
        handleFetchData(false);
    };

    // تعديل دالة الفلترة للتطبيق على البيانات المحلية فقط
    const applyLocalFilters = (ordersToFilter = orders): BinanceOrder[] => {
        let filtered = [...ordersToFilter];
        
        // فلتر حالة الأوردر
        if (orderStatus !== 'ALL') {
            filtered = filtered.filter(order => order.status === orderStatus);
        }
        
        // فلتر نوع الأوردر
        if (orderType !== 'ALL') {
            filtered = filtered.filter(order => order.type === orderType);
        }

        // فلتر نوع العملة
        if (selectedCurrency !== 'ALL') {
            filtered = filtered.filter(order => order.fiatCurrency === selectedCurrency);
        }
        
        // فلتر نوع الرسوم
        if (orderFeeType !== 'ALL') {
            filtered = filtered.filter(order => {
                if (orderFeeType === 'TAKER') return order.fee === 0.05;
                return order.fee !== 0.05;
            });
        }

        return filtered;
    };

    // تطبيق الفلترة المحلية عند تغيير معايير الفلترة المحلية
    React.useEffect(() => {
        if (orders.length > 0) {
            const filtered = applyLocalFilters();
            setFilteredOrders(filtered);
        }
    }, [orderStatus, orderType, orderFeeType, selectedCurrency, orders]);

    // دالة تصدير البيانات إلى Excel
    const handleExportToExcel = () => {
        // حساب المجاميع
        const totalEGP = filteredOrders.reduce((sum, order) => sum + order.fiatAmount, 0);
        const totalUSDT = filteredOrders.reduce((sum, order) => {
            if (order.fee === 0) {
                return sum + (order.type === 'BUY' ? 
                    (order.cryptoAmount - 0.05) : 
                    (order.cryptoAmount + 0.05));
            }
            return sum + order.actualUsdt;
        }, 0);
        const totalUsdtB = filteredOrders.reduce((sum, order) => sum + order.cryptoAmount, 0);
        const totalFees = filteredOrders.reduce((sum, order) => sum + (order.fee === 0 ? 0.05 : order.fee), 0);
        const averagePrice = totalUSDT > 0 ? totalEGP / totalUSDT : 0;

        // إنشاء مصفوفة من البيانات المراد تصديرها
        const exportData = filteredOrders.map((order, index) => ({
            '#': index + 1,
            'ID': order.orderId,
            'Type': order.type === 'BUY' ? 'Buy' : 'Sell',
            'EGP': order.fiatAmount.toFixed(2),
            'Usdt B': order.cryptoAmount.toFixed(2),
            'USDT': order.fee === 0 ? 
                (order.type === 'BUY' ? 
                    (order.cryptoAmount - 0.05).toFixed(2) : 
                    (order.cryptoAmount + 0.05).toFixed(2)) : 
                order.actualUsdt.toFixed(2),
            'Price': order.fee === 0 ? 
                (order.type === 'BUY' ? 
                    (order.fiatAmount / (order.cryptoAmount - 0.05)).toFixed(3) : 
                    (order.fiatAmount / (order.cryptoAmount + 0.05)).toFixed(3)) : 
                (order.fiatAmount / order.actualUsdt).toFixed(3),
            'Fees': order.fee === 0 ? '0.05 🔄' : order.fee.toFixed(2),
            'Status': order.status,
            'Date': new Date(order.createTime).toLocaleString('en-GB', { hour12: false })
        }));

        // إضافة صف المجاميع
        exportData.push({
            '#': exportData.length + 1,
            'ID': 'Total',
            'Type': '',
            'EGP': totalEGP.toFixed(2),
            'Usdt B': totalUsdtB.toFixed(2),
            'USDT': totalUSDT.toFixed(2),
            'Price': averagePrice.toFixed(2),
            'Fees': totalFees.toFixed(2),
            'Status': 'COMPLETED' as const,
            'Date': ''
        });

        // إنشاء ورقة عمل جديدة
        const worksheet = XLSX.utils.json_to_sheet(exportData);

        // تعديل عرض الأعمدة
        const columnWidths = [
            { wch: 5 },
            { wch: 15 },
            { wch: 8 },
            { wch: 12 },
            { wch: 10 },
            { wch: 10 },
            { wch: 10 },
            { wch: 8 },
            { wch: 12 },
            { wch: 20 }
        ];
        worksheet['!cols'] = columnWidths;

        // إنشاء كتاب عمل جديد
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

        // حفظ الملف
        const fileName = `binance_orders_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    return (
        <div className="p-4">
            <form onSubmit={handleConnect} className="space-y-4">
                {/* قسم اختيار المفاتيح المحفوظة */}
                {savedCredentials.length > 0 && (
                    <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <div className="flex-grow">
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    اختر مفتاح محفوظ
                                </label>
                                <select
                                    value={selectedCredential}
                                    onChange={handleSelectCredential}
                                    className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 outline-none"
                                >
                                    <option value="">-- اختر --</option>
                                    {savedCredentials.map(cred => (
                                        <option key={cred.name} value={cred.name}>
                                            {cred.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {selectedCredential && (
                                <button
                                    type="button"
                                    onClick={() => handleDeleteCredential(selectedCredential)}
                                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors duration-200 flex items-center justify-center gap-1 font-medium"
                                >
                                    <span>حذف</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-3 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <h3 className="text-base font-bold mb-2 text-gray-800 text-right border-r-4 border-indigo-500 pr-3">بيانات الاتصال</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700">
                                API Key
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 pl-10"
                                    placeholder="أدخل API Key"
                                    disabled={isConnected}
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700">
                                Secret Key
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={secretKey}
                                    onChange={(e) => setSecretKey(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 pl-10"
                                    placeholder="أدخل Secret Key"
                                    disabled={isConnected}
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2 pt-1">
                        {!isConnected ? (
                            <>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-grow bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-2 rounded-lg disabled:opacity-50 transition-all duration-200 hover:from-blue-600 hover:to-indigo-700 font-medium shadow-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>جاري الاتصال...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            <span>اتصال</span>
                                        </>
                                    )}
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => setShowSaveForm(!showSaveForm)}
                                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-2 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 font-medium shadow-sm flex items-center justify-center gap-2"
                                >
                                    {showSaveForm ? (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            <span>إلغاء الحفظ</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                            </svg>
                                            <span>حفظ المفاتيح</span>
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsConnected(false);
                                    setOrders([]);
                                    setFilteredOrders([]);
                                }}
                                className="bg-gradient-to-r from-gray-500 to-gray-600 text-white p-2 rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all duration-200 font-medium shadow-sm flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                                </svg>
                                <span>تغيير المفاتيح</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* نموذج حفظ المفاتيح */}
                {showSaveForm && (
                    <div className="mt-2 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 shadow-sm">
                        <h4 className="text-sm font-semibold mb-2 text-green-800 text-right">حفظ المفاتيح للاستخدام لاحقاً</h4>
                        <div className="mb-2">
                            <label className="block text-sm font-medium mb-1 text-right text-green-700">
                                اسم المفتاح
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={credentialName}
                                    onChange={(e) => setCredentialName(e.target.value)}
                                    className="w-full p-2 border border-green-200 rounded-lg text-right focus:ring-2 focus:ring-green-300 focus:border-green-500 transition-all duration-200 pl-10"
                                    placeholder="أدخل اسماً للمفتاح"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveCredential}
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-700 text-white p-2 rounded-lg hover:from-green-700 hover:to-emerald-800 transition-all duration-200 font-medium shadow-sm flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>حفظ</span>
                        </button>
                    </div>
                )}
            </form>

            {/* قسم الفلترة الموحد - يظهر فقط بعد الاتصال */}
            {isConnected && (
                <div className="mt-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100 shadow-sm">
                    <h3 className="text-base font-bold mb-4 text-indigo-800 text-right border-r-4 border-indigo-500 pr-3">
                        فلترة الأوردرات والبحث
                    </h3>
                    
                    <div className="space-y-4">
                        {/* نطاق التاريخ والخيارات الأساسية */}
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    من تاريخ
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full p-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    إلى تاريخ
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full p-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    نوع الأوردر
                                </label>
                                <div className="relative">
                                    <select
                                        value={orderType}
                                        onChange={(e) => setOrderType(e.target.value as 'ALL' | 'BUY' | 'SELL')}
                                        className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 appearance-none"
                                    >
                                        <option value="ALL">الكل</option>
                                        <option value="BUY">شراء</option>
                                        <option value="SELL">بيع</option>
                                    </select>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    حالة الأوردر
                                </label>
                                <div className="relative">
                                    <select
                                        value={orderStatus}
                                        onChange={(e) => setOrderStatus(e.target.value as 'ALL' | 'COMPLETED' | 'CANCELLED')}
                                        className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 appearance-none"
                                    >
                                        <option value="ALL">الكل</option>
                                        <option value="COMPLETED">مكتمل</option>
                                        <option value="CANCELLED">ملغي</option>
                                    </select>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    نوع الرسوم
                                </label>
                                <div className="relative">
                                    <select
                                        value={orderFeeType}
                                        onChange={(e) => setOrderFeeType(e.target.value as 'ALL' | 'MAKER' | 'TAKER')}
                                        className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 appearance-none"
                                    >
                                        <option value="ALL">الكل</option>
                                        <option value="MAKER">ميكر</option>
                                        <option value="TAKER">تيكر</option>
                                    </select>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    نوع العملة
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedCurrency}
                                        onChange={(e) => setSelectedCurrency(e.target.value)}
                                        className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 appearance-none"
                                    >
                                        <option value="ALL">الكل</option>
                                        {availableCurrencies.map(currency => (
                                            <option key={currency} value={currency}>
                                                {currency}
                                            </option>
                                        ))}
                                    </select>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        
                        {/* خيارات إضافية - الصف الثاني */}
                        <div className="flex items-center gap-3 justify-between">
                            <div className="w-48">
                                <label className="block text-sm font-semibold mb-1 text-right text-indigo-700">
                                    عدد النتائج في الصفحة
                                </label>
                                <div className="relative">
                                    <select
                                        value={rowsPerPage}
                                        onChange={(e) => setRowsPerPage(parseInt(e.target.value))}
                                        className="w-full p-2 border border-indigo-200 rounded-lg text-right focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all duration-200 appearance-none"
                                    >
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <div className="flex-grow flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => handleFetchData(true)}
                                    disabled={fetchingData}
                                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md disabled:opacity-50 flex items-center justify-center gap-2 min-w-[200px]"
                                >
                                    {fetchingData ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>جاري البحث...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <span>بحث وجلب البيانات</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* عرض الأوردرات - يظهر فقط بعد جلب البيانات */}
            {filteredOrders.length > 0 && (
                <div className="mt-4 overflow-x-auto" dir="ltr">
                    <div className="mb-2 flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                            تم العثور على {filteredOrders.length} أوردر
                        </span>
                        <button
                            onClick={handleExportToExcel}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>تصدير إلى Excel</span>
                        </button>
                    </div>
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4 text-Center">#</th>
                                <th className="p-4 text-Center">ID</th>
                                <th className="p-4 text-Center">Type</th>
                                <th className="p-4 text-Center">EGP</th>
                                <th className="p-4 text-Center">Usdt B</th>
                                <th className="p-4 text-Center">USDT</th>
                                <th className="p-4 text-Center">Price</th>
                                <th className="p-4 text-Center">Fees</th>
                                <th className="p-4 text-Center">Status</th>
                                <th className="p-4 text-Center">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order, index) => (
                                <tr 
                                    key={order.orderId}
                                    className={
                                        order.status === 'CANCELLED' ? 'bg-white' :
                                        order.type === 'BUY' ? 'bg-green-50' : 'bg-red-50'
                                    }
                                >
                                    <td className="p-4 text-center">{index + 1}</td>
                                    <td className="p-4">
                                        <span 
                                            className="cursor-pointer hover:text-blue-500"
                                            onClick={() => {
                                                navigator.clipboard.writeText(order.orderId);
                                            }}
                                            title="انقر للنسخ"
                                        >
                                            ...{order.orderId.slice(-5)}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={order.type === 'BUY' ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                                            {order.type === 'BUY' ? 'Buy' : 'Sell'}
                                        </span>
                                    </td>
                                    <td className="p-4">{order.fiatAmount.toFixed(2)}</td>
                                    <td className="p-4">{order.cryptoAmount.toFixed(2)}</td>
                                    <td className="p-4 font-bold">
                                        {order.fee === 0 ? 
                                            (order.type === 'BUY' ? 
                                                (order.cryptoAmount - 0.05).toFixed(2) : 
                                                (order.cryptoAmount + 0.05).toFixed(2)) : 
                                            order.actualUsdt.toFixed(2)
                                        }
                                    </td>
                                    <td className="p-4">
                                        {order.fee === 0 ? 
                                            (order.type === 'BUY' ? 
                                                (order.fiatAmount / (order.cryptoAmount - 0.05)).toFixed(3) : 
                                                (order.fiatAmount / (order.cryptoAmount + 0.05)).toFixed(3)) : 
                                            (order.fiatAmount / order.actualUsdt).toFixed(3)
                                        }
                                    </td>
                                    <td className="p-4">
                                        {order.fee === 0 ? `0.05 🔄` : order.fee.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={
                                            order.status === 'COMPLETED' ? 'text-green-500' :
                                            order.status === 'CANCELLED' ? 'text-red-500' : 'text-gray-500'
                                        }>
                                            {order.status === 'COMPLETED' ? '✅' :
                                             order.status === 'CANCELLED' ? '❌' : '⏳'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {new Date(order.createTime).toLocaleString('en-GB', { hour12: false })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {/* زر تحميل المزيد من البيانات */}
                    {hasMoreData && (
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={handleLoadMore}
                                disabled={fetchingData}
                                className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition-all duration-200 font-medium shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {fetchingData ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>جاري التحميل...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </svg>
                                        <span>تحميل المزيد من البيانات</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                    
                    <div className="mt-4 text-sm text-gray-600 space-y-1 p-4 bg-gray-50 rounded">
                        <p className="font-bold mb-2">دليل الألوان والعلامات:</p>
                        <p><span className="inline-block w-4 h-4 bg-green-50 border border-green-200"></span> خلفية خضراء: أوردر شراء</p>
                        <p><span className="inline-block w-4 h-4 bg-red-50 border border-red-200"></span> خلفية حمراء: أوردر بيع</p>
                        <p><span className="inline-block w-4 h-4 bg-white border"></span> بدون خلفية: أوردر ملغي</p>
                        <p>🔄 علامة بجانب الرسوم: Taker order (رسوم 0.05)</p>
                        <p>بدون علامة: Maker order</p>
                    </div>
                </div>
            )}
            
            {isConnected && filteredOrders.length === 0 && !fetchingData && (
                <div className="mt-4 p-6 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                    <p className="text-yellow-700 font-medium mb-2">لا توجد أوردرات تطابق معايير الفلترة</p>
                    <p className="text-sm text-yellow-600">حاول تغيير معايير البحث أو تحديد فترة زمنية أخرى</p>
                </div>
            )}
            
            {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}
        </div>
    );
};
