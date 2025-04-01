import React, { useState, useRef, useMemo } from 'react';
import { FileProcessorService } from '../services/fileProcessorService';
import { BatchFileSummary, ProcessedFile } from '../types/types';
import * as XLSX from 'xlsx';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area
} from 'recharts';

export const BatchAnalyzerTab: React.FC = () => {
  const [summary, setSummary] = useState<BatchFileSummary | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [totalSelectedFiles, setTotalSelectedFiles] = useState<number>(0);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [showAllDetails, setShowAllDetails] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // استيراد ملفات متعددة
  const handleFilesImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // تجميع الملفات المحددة
    const newFiles = Array.from(files);
    
    // فلترة ملفات الإكسل فقط
    const excelFiles = newFiles.filter(file => 
      file.name.toLowerCase().endsWith('.xlsx') || 
      file.name.toLowerCase().endsWith('.xls')
    );
    
    if (excelFiles.length === 0) {
      setProcessingStatus('لم يتم العثور على ملفات إكسل في الملفات المحددة');
      return;
    }
    
    // إضافة الملفات الجديدة إلى القائمة الحالية
    const updatedFiles = [...selectedFiles, ...excelFiles];
    setSelectedFiles(updatedFiles);
    
    // تحديث الملفات المحددة تلقائياً
    const newFileIds = new Set(selectedFileIds);
    excelFiles.forEach(file => {
      newFileIds.add(file.name);
    });
    setSelectedFileIds(newFileIds);
    
    setTotalSelectedFiles(updatedFiles.length);
    
    // إعادة تعيين حقل الإدخال
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    setProcessingStatus(`تم إضافة ${excelFiles.length} ملف. الإجمالي: ${updatedFiles.length} ملف`);
  };

  // استيراد مجلد
  const handleFolderImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // الحصول على قائمة ملفات الإكسل من المجلد
    const excelFiles = Array.from(files).filter(file => 
      file.name.toLowerCase().endsWith('.xlsx') || 
      file.name.toLowerCase().endsWith('.xls')
    );
    
    if (excelFiles.length === 0) {
      setProcessingStatus('لم يتم العثور على ملفات إكسل في المجلد المحدد');
      return;
    }
    
    // إضافة الملفات الجديدة إلى القائمة الحالية
    const updatedFiles = [...selectedFiles, ...excelFiles];
    setSelectedFiles(updatedFiles);
    
    // تحديث الملفات المحددة تلقائياً
    const newFileIds = new Set(selectedFileIds);
    excelFiles.forEach(file => {
      newFileIds.add(file.name);
    });
    setSelectedFileIds(newFileIds);
    
    setTotalSelectedFiles(updatedFiles.length);
    
    // إعادة تعيين حقل الإدخال
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    
    setProcessingStatus(`تم إضافة ${excelFiles.length} ملف من المجلد. الإجمالي: ${updatedFiles.length} ملف`);
  };

  // تحديد/إلغاء تحديد ملف
  const toggleFileSelection = (fileName: string) => {
    const newSelectedFileIds = new Set(selectedFileIds);
    if (newSelectedFileIds.has(fileName)) {
      newSelectedFileIds.delete(fileName);
    } else {
      newSelectedFileIds.add(fileName);
    }
    setSelectedFileIds(newSelectedFileIds);
    
    // تحديث قائمة الملفات المحددة
    const updatedFiles = selectedFiles.filter(file => newSelectedFileIds.has(file.name));
    setSelectedFiles(updatedFiles);
    setTotalSelectedFiles(updatedFiles.length);

    // إعادة حساب النتائج للملفات المحددة فقط
    const selectedProcessedFiles = processedFiles.filter(file => newSelectedFileIds.has(file.name));
    updateSummary(selectedProcessedFiles);
  };

  // تحديث ملخص النتائج
  const updateSummary = (files: ProcessedFile[]) => {
    if (files.length > 0) {
      const totalAmount = files.reduce((sum, file) => sum + file.totalAmount, 0);
      const totalUsdt = files.reduce((sum, file) => sum + file.totalUsdt, 0);
      const totalEntries = files.reduce((sum, file) => sum + file.entryCount, 0);
      const averagePrice = totalUsdt > 0 ? totalAmount / totalUsdt : 0;
      
      setSummary({
        totalAmount,
        totalUsdt,
        averagePrice,
        fileCount: files.length,
        entryCount: totalEntries,
        files: files.map(f => f.name)
      });
    } else {
      setSummary(null);
    }
  };

  // تحديث الملفات المحددة في الشهر
  const toggleMonthSelection = (month: string, isChecked: boolean) => {
    const monthFiles = processedFiles.filter(file => {
      const fileDate = extractDateFromFileName(file.name);
      if (!fileDate) return false;
      const fileMonth = `${(fileDate.getMonth() + 1).toString().padStart(2, '0')}/${fileDate.getFullYear()}`;
      return fileMonth === month;
    });

    const newSelectedFileIds = new Set(selectedFileIds);
    monthFiles.forEach(file => {
      if (isChecked) {
        newSelectedFileIds.add(file.name);
      } else {
        newSelectedFileIds.delete(file.name);
      }
    });
    setSelectedFileIds(newSelectedFileIds);

    // تحديث قائمة الملفات المحددة وإعادة حساب النتائج
    const updatedFiles = selectedFiles.filter(file => newSelectedFileIds.has(file.name));
    setSelectedFiles(updatedFiles);
    setTotalSelectedFiles(updatedFiles.length);

    // إعادة حساب النتائج للملفات المحددة فقط
    const selectedProcessedFiles = processedFiles.filter(file => newSelectedFileIds.has(file.name));
    updateSummary(selectedProcessedFiles);
  };

  // معالجة الملفات
  const processSelectedFiles = async () => {
    if (selectedFiles.length === 0) {
      setProcessingStatus('لم يتم اختيار أي ملفات للمعالجة');
      return;
    }

    // معالجة الملفات المحددة فقط
    const filesToProcess = selectedFiles.filter(file => selectedFileIds.has(file.name));
    await processFiles(filesToProcess);
  };

  // معالجة الملفات المحددة
  const processFiles = async (files: File[]) => {
    try {
      setIsProcessing(true);
      setProcessingStatus(`جاري معالجة ${files.length} ملف...`);
      
      // تنظيف النتائج السابقة
      setSummary(null);
      setProcessedFiles([]);
      setExpandedMonths(new Set());
      
      // معالجة كل ملف واحد تلو الآخر
      const processedResults: ProcessedFile[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessingStatus(`جاري معالجة الملف ${i + 1} من ${files.length}: ${file.name}`);
        
        try {
          // فحص امتداد الملف قبل المعالجة
          if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            const result = await FileProcessorService.processExcelFile(file);
            processedResults.push(result);
          } else {
            console.warn(`تم تجاهل الملف ${file.name} لأنه ليس ملف إكسل`);
          }
        } catch (error) {
          console.error(`خطأ في معالجة الملف ${file.name}:`, error);
          // استمر في المعالجة حتى مع وجود خطأ
        }
      }
      
      // حساب الإجماليات
      if (processedResults.length > 0) {
        setProcessedFiles(processedResults);
        
        const totalAmount = processedResults.reduce((sum, file) => sum + file.totalAmount, 0);
        const totalUsdt = processedResults.reduce((sum, file) => sum + file.totalUsdt, 0);
        const totalEntries = processedResults.reduce((sum, file) => sum + file.entryCount, 0);
        const averagePrice = totalUsdt > 0 ? totalAmount / totalUsdt : 0;
        
        setSummary({
          totalAmount,
          totalUsdt,
          averagePrice,
          fileCount: processedResults.length,
          entryCount: totalEntries,
          files: processedResults.map(f => f.name)
        });
        
        setProcessingStatus(`تم تحليل ${processedResults.length} ملف بنجاح (${totalEntries} عملية)`);
      } else {
        setProcessingStatus('لم يتم العثور على بيانات صالحة في الملفات المحددة');
      }
    } catch (error) {
      console.error('خطأ في معالجة الملفات:', error);
      setProcessingStatus(`حدث خطأ أثناء معالجة الملفات: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // مسح الملفات المحددة
  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setTotalSelectedFiles(0);
    setProcessingStatus('تم مسح قائمة الملفات المحددة');
  };

  // تصدير النتائج إلى ملف إكسل
  const handleExportResults = () => {
    if (!summary || processedFiles.length === 0) return;
    
    try {
      // إنشاء ورقة عمل للملخص
      const summaryData = [
        ['معلومات التحليل', ''],
        ['عدد الملفات', summary.fileCount.toString()],
        ['عدد العمليات', summary.entryCount.toString()],
        ['إجمالي المبلغ بالجنيه', summary.totalAmount.toFixed(4)],
        ['إجمالي كمية USDT', summary.totalUsdt.toFixed(4)],
        ['متوسط السعر', summary.averagePrice.toFixed(4)],
        ['', ''],
        ['تفاصيل الملفات', '']
      ];
      
      // إضافة تفاصيل كل ملف
      processedFiles.forEach((file, index) => {
        summaryData.push([
          `الملف ${index + 1}: ${file.name}`,
          ''
        ]);
        summaryData.push([
          'عدد العمليات',
          file.entryCount.toString()
        ]);
        summaryData.push([
          'إجمالي المبلغ بالجنيه',
          file.totalAmount.toFixed(4)
        ]);
        summaryData.push([
          'إجمالي كمية USDT',
          file.totalUsdt.toFixed(4)
        ]);
        summaryData.push([
          'متوسط السعر',
          (file.totalUsdt > 0 ? file.totalAmount / file.totalUsdt : 0).toFixed(4)
        ]);
        summaryData.push(['', '']);
      });
      
      // إنشاء ورقة عمل للتفاصيل
      const detailsData = [
        ['اسم الملف', 'المبلغ بالجنيه', 'كمية USDT', 'السعر']
      ];
      
      // تجميع كل العمليات من جميع الملفات
      processedFiles.forEach(file => {
        file.entries.forEach(entry => {
          detailsData.push([
            entry.fileName,
            entry.amount.toFixed(4),
            entry.usdtAmount.toFixed(4),
            entry.price.toFixed(4)
          ]);
        });
      });
      
      // إنشاء ورقة عمل للتحليل الشهري
      const monthlyData = getMonthlyAnalysisData();
      const monthlyAnalysisData = [
        ['الشهر', 'إجمالي المبلغ بالجنيه', 'إجمالي كمية USDT', 'متوسط السعر', 'عدد العمليات']
      ];
      
      Object.entries(monthlyData).forEach(([month, data]) => {
        monthlyAnalysisData.push([
          month,
          data.totalAmount.toFixed(4),
          data.totalUsdt.toFixed(4),
          data.averagePrice.toFixed(4),
          data.count.toString()
        ]);
      });
      
      // إنشاء مصنف إكسل وإضافة أوراق العمل
      const wb = XLSX.utils.book_new();
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'الملخص');
      
      const detailsWs = XLSX.utils.aoa_to_sheet(detailsData);
      XLSX.utils.book_append_sheet(wb, detailsWs, 'التفاصيل');
      
      const monthlyAnalysisWs = XLSX.utils.aoa_to_sheet(monthlyAnalysisData);
      XLSX.utils.book_append_sheet(wb, monthlyAnalysisWs, 'التحليل الشهري');
      
      // حفظ الملف
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `تحليل_الملفات_${today}.xlsx`);
      
      setProcessingStatus('تم تصدير النتائج بنجاح');
    } catch (error) {
      console.error('خطأ في تصدير النتائج:', error);
      setProcessingStatus('حدث خطأ أثناء تصدير النتائج');
    }
  };

  // تبديل حالة عرض جميع التفاصيل
  const toggleAllMonths = () => {
    if (showAllDetails) {
      setExpandedMonths(new Set());
    } else {
      const allMonths = new Set(Object.keys(monthlyAnalysisData || {}));
      setExpandedMonths(allMonths);
    }
    setShowAllDetails(!showAllDetails);
  };

  // تبديل عرض شهر معين
  const toggleMonth = (month: string) => {
    const newExpandedMonths = new Set(expandedMonths);
    if (newExpandedMonths.has(month)) {
      newExpandedMonths.delete(month);
    } else {
      newExpandedMonths.add(month);
    }
    setExpandedMonths(newExpandedMonths);
  };

  // استخراج تاريخ من اسم الملف
  const extractDateFromFileName = (fileName: string): Date | null => {
    // البحث عن نمط مثل: "Financial_Transfers_31-01-2025.xlsx"
    const datePattern = /(\d{2})[_.-](\d{2})[_.-](\d{4})/;
    const match = fileName.match(datePattern);
    
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      
      // التحقق من صحة التاريخ
      if (day > 0 && day <= 31 && month > 0 && month <= 12) {
        return new Date(year, month - 1, day);
      }
    }
    
    return null;
  };

  // تحليل البيانات الشهرية
  const getMonthlyAnalysisData = () => {
    const monthlyData: {
      [key: string]: {
        totalAmount: number;
        totalUsdt: number;
        averagePrice: number;
        count: number;
        month: number;
        year: number;
        minPrice: number;
        maxPrice: number;
        priceChange: number;
        volumeChange: number;
      }
    } = {};
    
    // تجميع البيانات حسب الشهر
    processedFiles.forEach(file => {
      const date = extractDateFromFileName(file.name);
      
      if (date) {
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const monthYear = `${month.toString().padStart(2, '0')}/${year}`;
        
        if (!monthlyData[monthYear]) {
          monthlyData[monthYear] = {
            totalAmount: 0,
            totalUsdt: 0,
            averagePrice: 0,
            count: 0,
            month,
            year,
            minPrice: Infinity,
            maxPrice: -Infinity,
            priceChange: 0,
            volumeChange: 0
          };
        }
        
        // تحديث البيانات الإجمالية
        monthlyData[monthYear].totalAmount += file.totalAmount;
        monthlyData[monthYear].totalUsdt += file.totalUsdt;
        monthlyData[monthYear].count += file.entryCount;

        // حساب أقل وأعلى سعر
        file.entries.forEach(entry => {
          const price = entry.price;
          monthlyData[monthYear].minPrice = Math.min(monthlyData[monthYear].minPrice, price);
          monthlyData[monthYear].maxPrice = Math.max(monthlyData[monthYear].maxPrice, price);
        });
      }
    });
    
    // حساب المتوسطات والتغيرات
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
      const [monthA, yearA] = a.split('/').map(Number);
      const [monthB, yearB] = b.split('/').map(Number);
      return yearA === yearB ? monthA - monthB : yearA - yearB;
    });

    let previousMonth: string | null = null;
    sortedMonths.forEach(month => {
      const data = monthlyData[month];
      
      // حساب متوسط السعر
      data.averagePrice = data.totalUsdt > 0 ? data.totalAmount / data.totalUsdt : 0;
      
      // حساب التغير في السعر والحجم
      if (previousMonth) {
        const prevData = monthlyData[previousMonth];
        data.priceChange = ((data.averagePrice - prevData.averagePrice) / prevData.averagePrice) * 100;
        data.volumeChange = ((data.totalUsdt - prevData.totalUsdt) / prevData.totalUsdt) * 100;
      }
      
      previousMonth = month;
    });
    
    return Object.fromEntries(
      sortedMonths.map(month => [month, monthlyData[month]])
    );
  };

  // البيانات المحللة حسب الشهر
  const monthlyAnalysisData = useMemo(() => {
    if (!processedFiles.length) return null;
    return getMonthlyAnalysisData();
  }, [processedFiles]);

  // رسم تمثيل للبيانات البيانية
  const renderMonthlyChart = () => {
    if (!monthlyAnalysisData || Object.keys(monthlyAnalysisData).length === 0) return (
      <div className="text-center py-8">
        <p className="text-gray-500">لا توجد بيانات كافية لعرض الرسم البياني</p>
      </div>
    );

    const chartData = Object.entries(monthlyAnalysisData).map(([month, data]) => ({
      month,
      averagePrice: parseFloat(data.averagePrice.toFixed(4)),
      minPrice: parseFloat(data.minPrice.toFixed(4)),
      maxPrice: parseFloat(data.maxPrice.toFixed(4)),
      volume: parseFloat(data.totalUsdt.toFixed(4)),
      priceChange: parseFloat(data.priceChange.toFixed(2)),
      volumeChange: parseFloat(data.volumeChange.toFixed(2))
    }));

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
            <p className="text-sm font-semibold mb-2 text-right">{label}</p>
            <div className="space-y-1 text-xs">
              <p className="text-right">
                <span className="text-gray-500">متوسط السعر:</span>
                <span className="font-semibold mr-1">{payload[0].value}</span>
              </p>
              <p className="text-right">
                <span className="text-gray-500">أقل سعر:</span>
                <span className="font-semibold mr-1">{payload[1].value}</span>
              </p>
              <p className="text-right">
                <span className="text-gray-500">أعلى سعر:</span>
                <span className="font-semibold mr-1">{payload[2].value}</span>
              </p>
              <p className="text-right">
                <span className="text-gray-500">حجم التداول:</span>
                <span className="font-semibold mr-1">{payload[3].value} USDT</span>
              </p>
              <p className="text-right">
                <span className="text-gray-500">التغير في السعر:</span>
                <span className={`font-semibold mr-1 ${payload[4].value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {payload[4].value > 0 ? '+' : ''}{payload[4].value}%
                </span>
              </p>
              <p className="text-right">
                <span className="text-gray-500">التغير في الحجم:</span>
                <span className={`font-semibold mr-1 ${payload[5].value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {payload[5].value > 0 ? '+' : ''}{payload[5].value}%
                </span>
              </p>
            </div>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="space-y-6">
        {/* الرسم البياني الرئيسي */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h4 className="text-sm font-semibold mb-3 text-right">تطور متوسط السعر الشهري</h4>
          <div className="h-[400px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="month" 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <YAxis 
                  yAxisId="left"
                  orientation="left"
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  label={{ 
                    value: 'السعر', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { fill: '#6B7280' }
                  }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  label={{ 
                    value: 'USDT حجم التداول', 
                    angle: 90, 
                    position: 'insideRight',
                    style: { fill: '#6B7280' }
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="maxPrice"
                  fill="#E5E7EB"
                  stroke="#9CA3AF"
                  name="نطاق السعر"
                  strokeWidth={1}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="minPrice"
                  fill="#F3F4F6"
                  stroke="#9CA3AF"
                  strokeWidth={1}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="averagePrice"
                  stroke="#4F46E5"
                  strokeWidth={2}
                  name="متوسط السعر"
                  dot={{ fill: '#4F46E5', r: 4 }}
                  activeDot={{ r: 6, fill: '#4F46E5' }}
                />
                <Bar
                  yAxisId="right"
                  dataKey="volume"
                  fill="#93C5FD"
                  opacity={0.6}
                  name="حجم التداول"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* رسم بياني للتغيرات */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h4 className="text-sm font-semibold mb-3 text-right">التغيرات الشهرية في السعر والحجم</h4>
          <div className="h-[300px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="month" 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  label={{ 
                    value: 'نسبة التغير %', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { fill: '#6B7280' }
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Bar
                  dataKey="priceChange"
                  fill="#34D399"
                  opacity={0.8}
                  name="التغير في السعر"
                />
                <Bar
                  dataKey="volumeChange"
                  fill="#818CF8"
                  opacity={0.8}
                  name="التغير في الحجم"
                />
                <Line
                  type="monotone"
                  dataKey="priceChange"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="volumeChange"
                  stroke="#4F46E5"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-7xl mx-auto bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-right text-gray-800">تحليل ملفات الإكسل المتعددة</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* قسم الاستيراد */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-right">استيراد الملفات</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                اختيار ملفات متعددة
              </label>
              <div className="flex">
                <label className="flex-1 cursor-pointer bg-white text-center py-2 px-4 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition">
                  <span className="text-indigo-600">اختيار ملفات</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    onChange={handleFilesImport}
                    className="hidden"
                    ref={fileInputRef}
                    disabled={isProcessing}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                يمكنك اختيار عدة ملفات بالضغط على Ctrl أثناء الاختيار
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                اختيار مجلد كامل
              </label>
              <div className="flex">
                <label className="flex-1 cursor-pointer bg-white text-center py-2 px-4 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition">
                  <span className="text-indigo-600">اختيار مجلد</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    /* @ts-ignore */
                    directory=""
                    webkitdirectory=""
                    onChange={handleFolderImport}
                    className="hidden"
                    ref={folderInputRef}
                    disabled={isProcessing}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                يمكنك اختيار مجلد واحد في كل مرة، ويمكنك تكرار العملية عدة مرات لإضافة محتويات مجلدات أخرى
              </p>
            </div>

            {/* عرض عدد الملفات المحددة */}
            {totalSelectedFiles > 0 && (
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200 mt-4">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-2 rtl:space-x-reverse">
                    <button
                      onClick={clearSelectedFiles}
                      className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                      disabled={isProcessing}
                    >
                      مسح
                    </button>
                    <button
                      onClick={processSelectedFiles}
                      className="text-xs px-2 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200 transition"
                      disabled={isProcessing}
                    >
                      معالجة
                    </button>
                  </div>
                  <div className="text-sm text-blue-600 font-medium text-right">
                    تم اختيار {totalSelectedFiles} ملف
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* حالة المعالجة */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {isProcessing && (
                  <svg className="animate-spin h-5 w-5 text-indigo-600 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </div>
              <div className="text-sm text-right text-gray-600">{processingStatus}</div>
            </div>
          </div>

          {/* إرشادات استخدام التطبيق */}
          <div className="mt-6 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
            <h4 className="text-sm font-semibold text-right text-yellow-800 mb-2">ملاحظة مهمة:</h4>
            <p className="text-xs text-yellow-700 text-right mb-2">
              تقنيًا، المتصفحات لا تدعم اختيار عدة مجلدات دفعة واحدة. يمكنك اختيار مجلد واحد، ثم تكرار العملية عدة مرات لإضافة محتويات مجلدات أخرى.
            </p>
            <ul className="text-xs text-yellow-700 space-y-1 pr-5 list-disc text-right">
              <li>اضغط على "اختيار مجلد" لتحديد مجلد كامل (سيتم تحميل جميع ملفات الإكسل داخل هذا المجلد وجميع مجلداته الفرعية تلقائيًا)</li>
              <li>كرر الخطوة السابقة لإضافة محتويات مجلدات أخرى</li>
              <li>بعد اختيار كل المجلدات المطلوبة، اضغط على "معالجة" للبدء في تحليل البيانات</li>
            </ul>
          </div>
        </div>
        
        {/* قسم النتائج */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-right">ملخص النتائج</h3>
          
          {summary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded border border-gray-200">
                  <div className="text-sm text-gray-500 text-right">عدد الملفات</div>
                  <div className="text-lg font-bold text-right">{summary.fileCount}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200">
                  <div className="text-sm text-gray-500 text-right">عدد العمليات</div>
                  <div className="text-lg font-bold text-right">{summary.entryCount}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200">
                  <div className="text-sm text-gray-500 text-right">إجمالي المبلغ بالجنيه</div>
                  <div className="text-lg font-bold text-right">{summary.totalAmount.toFixed(4)}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200">
                  <div className="text-sm text-gray-500 text-right">إجمالي كمية USDT</div>
                  <div className="text-lg font-bold text-right">{summary.totalUsdt.toFixed(4)}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200 col-span-2">
                  <div className="text-sm text-gray-500 text-right">متوسط السعر</div>
                  <div className="text-xl font-bold text-right text-indigo-600">{summary.averagePrice.toFixed(4)}</div>
                </div>
              </div>
              
              <button
                onClick={handleExportResults}
                disabled={isProcessing}
                className="w-full mt-4 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition disabled:opacity-50"
              >
                تصدير النتائج إلى Excel
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <p className="text-gray-500">قم باستيراد ملفات الإكسل لعرض النتائج</p>
            </div>
          )}
        </div>
      </div>
      
      {/* تحليل المبيعات الشهري */}
      {monthlyAnalysisData && Object.keys(monthlyAnalysisData).length > 0 && (
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold mb-4 text-right">تحليل المبيعات الشهري</h3>
          
          {renderMonthlyChart()}
          
          <div className="mt-4 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الشهر</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">إجمالي المبلغ بالجنيه</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">إجمالي كمية USDT</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">متوسط السعر</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">عدد العمليات</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(monthlyAnalysisData).map(([month, data], index) => (
                  <tr key={month} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">{month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{data.totalAmount.toFixed(4)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{data.totalUsdt.toFixed(4)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{data.averagePrice.toFixed(4)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{data.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* قسم تفاصيل الملفات */}
      {processedFiles.length > 0 && (
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAllMonths}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
              >
                {showAllDetails ? 'طي الكل' : 'عرض الكل'}
              </button>
              <button
                onClick={() => {
                  const allFileIds = new Set(selectedFiles.map(file => file.name));
                  const newSelectedFileIds = new Set<string>();
                  
                  if (selectedFileIds.size !== allFileIds.size) {
                    // تحديد الكل
                    processedFiles.forEach(file => newSelectedFileIds.add(file.name));
                  }
                  
                  setSelectedFileIds(newSelectedFileIds);
                  const updatedFiles = selectedFiles.filter(file => newSelectedFileIds.has(file.name));
                  setSelectedFiles(updatedFiles);
                  setTotalSelectedFiles(updatedFiles.length);
                  
                  // إعادة حساب النتائج للملفات المحددة فقط
                  const selectedProcessedFiles = processedFiles.filter(file => newSelectedFileIds.has(file.name));
                  updateSummary(selectedProcessedFiles);
                }}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
              >
                {selectedFileIds.size === selectedFiles.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
            </div>
            <h3 className="text-lg font-semibold text-right">تفاصيل الملفات</h3>
          </div>
          
          {/* عرض الملفات حسب الشهور */}
          <div className="space-y-2">
            {Object.entries(monthlyAnalysisData || {}).map(([month, data]) => {
              const monthFiles = processedFiles.filter(file => {
                const fileDate = extractDateFromFileName(file.name);
                if (!fileDate) return false;
                const fileMonth = `${(fileDate.getMonth() + 1).toString().padStart(2, '0')}/${fileDate.getFullYear()}`;
                return fileMonth === month;
              });

              return (
                <div key={month} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                  {/* رأس الشهر */}
                  <div
                    className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-100 transition"
                    onClick={() => toggleMonth(month)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={monthFiles.every(file => selectedFileIds.has(file.name))}
                        onChange={(e) => {
                          toggleMonthSelection(month, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <svg
                        className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${expandedMonths.has(month) ? 'transform rotate-90' : ''}`}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M9 5l7 7-7 7"></path>
                      </svg>
                      <span className="text-sm text-gray-500">{monthFiles.length} ملف</span>
                    </div>
                    <h4 className="font-semibold text-right">{month}</h4>
                  </div>
                  
                  {/* تفاصيل الشهر */}
                  {expandedMonths.has(month) && (
                    <div className="p-3 border-t border-gray-200">
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-white p-2 rounded border border-gray-200">
                          <div className="text-xs text-gray-500 text-right">المبلغ بالجنيه</div>
                          <div className="text-sm font-bold text-right">{data.totalAmount.toFixed(4)}</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-gray-200">
                          <div className="text-xs text-gray-500 text-right">كمية USDT</div>
                          <div className="text-sm font-bold text-right">{data.totalUsdt.toFixed(4)}</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-gray-200">
                          <div className="text-xs text-gray-500 text-right">متوسط السعر</div>
                          <div className="text-sm font-bold text-right">{data.averagePrice.toFixed(4)}</div>
                        </div>
                      </div>
                      
                      {/* قائمة الملفات في هذا الشهر */}
                      <div className="space-y-2">
                        {monthFiles.map((file, fileIndex) => (
                          <div key={fileIndex} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedFileIds.has(file.name)}
                                onChange={() => toggleFileSelection(file.name)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              />
                              <div>
                                <div className="text-sm font-medium text-gray-700 text-right">{file.name}</div>
                                <div className="text-xs text-gray-500 text-right">
                                  {file.totalAmount.toFixed(4)} جنيه | {file.totalUsdt.toFixed(4)} USDT
                                </div>
                              </div>
                            </div>
                            <div className="text-sm font-semibold text-indigo-600 text-right">
                              {(file.totalAmount / file.totalUsdt).toFixed(4)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}; 