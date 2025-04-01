import React, { useState, useRef, useEffect } from 'react';
import { FileProcessorService } from '../services/fileProcessorService';
import { BatchFileSummary, ProcessedFile } from '../types/types';
import * as XLSX from 'xlsx';

export const BatchAnalyzerTab: React.FC = () => {
  const [summary, setSummary] = useState<BatchFileSummary | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [totalSelectedFiles, setTotalSelectedFiles] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multipleFoldersInputRef = useRef<HTMLInputElement>(null);

  // استيراد ملفات متعددة
  const handleFilesImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // تجميع الملفات المحددة
    const newFiles = Array.from(files);
    setSelectedFiles(prev => [...prev, ...newFiles]);
    setTotalSelectedFiles(prev => prev + newFiles.length);
    
    // إعادة تعيين حقل الإدخال
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // استيراد مجلد كامل
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
    
    // تجميع الملفات المحددة
    setSelectedFiles(prev => [...prev, ...excelFiles]);
    setTotalSelectedFiles(prev => prev + excelFiles.length);
    
    // إعادة تعيين حقل الإدخال
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  // استيراد عدة مجلدات
  const handleMultipleFoldersImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // الحصول على قائمة ملفات الإكسل من المجلدات
    const excelFiles = Array.from(files).filter(file => 
      file.name.toLowerCase().endsWith('.xlsx') || 
      file.name.toLowerCase().endsWith('.xls')
    );
    
    if (excelFiles.length === 0) {
      setProcessingStatus('لم يتم العثور على ملفات إكسل في المجلدات المحددة');
      return;
    }
    
    // تجميع الملفات المحددة
    setSelectedFiles(prev => [...prev, ...excelFiles]);
    setTotalSelectedFiles(prev => prev + excelFiles.length);
    
    // إعادة تعيين حقل الإدخال
    if (multipleFoldersInputRef.current) {
      multipleFoldersInputRef.current.value = '';
    }
  };

  // معالجة الملفات
  const processSelectedFiles = async () => {
    if (selectedFiles.length === 0) {
      setProcessingStatus('لم يتم اختيار أي ملفات للمعالجة');
      return;
    }

    await processFiles(selectedFiles);
    // تنظيف الملفات المحددة بعد المعالجة
    setSelectedFiles([]);
    setTotalSelectedFiles(0);
  };

  // معالجة الملفات المحددة
  const processFiles = async (files: File[]) => {
    try {
      setIsProcessing(true);
      setProcessingStatus(`جاري معالجة ${files.length} ملف...`);
      
      // تنظيف النتائج السابقة
      setSummary(null);
      setProcessedFiles([]);
      
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
        ['إجمالي المبلغ بالجنيه', summary.totalAmount.toFixed(2)],
        ['إجمالي كمية USDT', summary.totalUsdt.toFixed(2)],
        ['متوسط السعر', summary.averagePrice.toFixed(2)],
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
          file.totalAmount.toFixed(2)
        ]);
        summaryData.push([
          'إجمالي كمية USDT',
          file.totalUsdt.toFixed(2)
        ]);
        summaryData.push([
          'متوسط السعر',
          (file.totalUsdt > 0 ? file.totalAmount / file.totalUsdt : 0).toFixed(2)
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
            entry.amount.toFixed(2),
            entry.usdtAmount.toFixed(2),
            entry.price.toFixed(2)
          ]);
        });
      });
      
      // إنشاء مصنف إكسل وإضافة أوراق العمل
      const wb = XLSX.utils.book_new();
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'الملخص');
      
      const detailsWs = XLSX.utils.aoa_to_sheet(detailsData);
      XLSX.utils.book_append_sheet(wb, detailsWs, 'التفاصيل');
      
      // حفظ الملف
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `تحليل_الملفات_${today}.xlsx`);
      
      setProcessingStatus('تم تصدير النتائج بنجاح');
    } catch (error) {
      console.error('خطأ في تصدير النتائج:', error);
      setProcessingStatus('حدث خطأ أثناء تصدير النتائج');
    }
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                اختيار مجلد آخر (تجميع)
              </label>
              <div className="flex">
                <label className="flex-1 cursor-pointer bg-white text-center py-2 px-4 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition">
                  <span className="text-indigo-600">إضافة مجلد آخر</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    /* @ts-ignore */
                    directory=""
                    webkitdirectory=""
                    onChange={handleMultipleFoldersImport}
                    className="hidden"
                    ref={multipleFoldersInputRef}
                    disabled={isProcessing}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                يمكنك إضافة أكثر من مجلد واحدًا تلو الآخر، ثم معالجتهم جميعًا معًا
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
                  <div className="text-lg font-bold text-right">{summary.totalAmount.toFixed(2)}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200">
                  <div className="text-sm text-gray-500 text-right">إجمالي كمية USDT</div>
                  <div className="text-lg font-bold text-right">{summary.totalUsdt.toFixed(2)}</div>
                </div>
                <div className="bg-white p-3 rounded border border-gray-200 col-span-2">
                  <div className="text-sm text-gray-500 text-right">متوسط السعر</div>
                  <div className="text-xl font-bold text-right text-indigo-600">{summary.averagePrice.toFixed(2)}</div>
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
      
      {/* قسم تفاصيل الملفات */}
      {processedFiles.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4 text-right">تفاصيل الملفات</h3>
          
          <div className="space-y-4">
            {processedFiles.map((file, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500">{file.entryCount} عملية</div>
                  <div className="font-semibold text-right">{file.name}</div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 text-right">المبلغ بالجنيه</div>
                    <div className="text-sm font-bold text-right">{file.totalAmount.toFixed(2)}</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 text-right">كمية USDT</div>
                    <div className="text-sm font-bold text-right">{file.totalUsdt.toFixed(2)}</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 text-right">متوسط السعر</div>
                    <div className="text-sm font-bold text-right">
                      {(file.totalUsdt > 0 ? file.totalAmount / file.totalUsdt : 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 