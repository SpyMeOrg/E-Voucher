import { read, utils } from 'xlsx';
import { BatchFileEntry, BatchFileSummary, ProcessedFile } from '../types/types';

export class FileProcessorService {
  /**
   * معالجة ملف إكسل واستخراج البيانات منه
   */
  public static async processExcelFile(file: File): Promise<ProcessedFile> {
    try {
      // قراءة الملف
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      
      // التحقق من وجود أوراق عمل
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('الملف لا يحتوي على أي أوراق عمل');
      }
      
      // استخدام الورقة الأولى
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) {
        throw new Error('لا يمكن قراءة ورقة العمل الأولى');
      }
      
      // تحويل البيانات إلى JSON
      const jsonData = utils.sheet_to_json(worksheet) as Record<string, any>[];
      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        return {
          name: file.name,
          path: file.name,
          totalAmount: 0,
          totalUsdt: 0,
          entryCount: 0,
          entries: []
        };
      }

      // استخراج أسماء الأعمدة
      const headers = Object.keys(jsonData[0] as Record<string, any>);
      const amountCol = this.findAmountColumn(headers);
      const usdtCol = this.findUsdtColumn(headers);

      if (!amountCol || !usdtCol) {
        throw new Error(`لم يتم العثور على الأعمدة المطلوبة في الملف ${file.name}. الأعمدة المتوفرة: ${headers.join(', ')}`);
      }

      // معالجة البيانات
      const entries: BatchFileEntry[] = [];
      let totalAmount = 0;
      let totalUsdt = 0;
      let skippedRows = 0;

      for (const row of jsonData) {
        // تجاهل صفوف الإجمالي والعناوين
        if (this.isHeaderOrTotalRow(row)) {
          continue;
        }

        const amount = this.parseNumber(row[amountCol]);
        const usdtAmount = this.parseNumber(row[usdtCol]);

        // التحقق من صحة القيم
        if (this.isValidEntry(amount, usdtAmount)) {
          const price = amount / usdtAmount;
          entries.push({
            fileName: file.name,
            amount,
            usdtAmount,
            price
          });

          totalAmount += amount;
          totalUsdt += usdtAmount;
        } else {
          skippedRows++;
        }
      }

      // التحقق من وجود بيانات صالحة
      if (entries.length === 0) {
        console.warn(`لم يتم العثور على بيانات صالحة في الملف ${file.name}. تم تجاهل ${skippedRows} صفوف.`);
      }

      return {
        name: file.name,
        path: file.name,
        totalAmount,
        totalUsdt,
        entryCount: entries.length,
        entries
      };
    } catch (error) {
      console.error(`خطأ في معالجة الملف ${file.name}:`, error);
      throw error;
    }
  }

  /**
   * التحقق مما إذا كان الصف عنوان أو إجمالي
   */
  private static isHeaderOrTotalRow(row: Record<string, any>): boolean {
    const rowStr = JSON.stringify(row).toLowerCase();
    const keywords = ['total', 'إجمالي', 'اجمالي', 'المجموع', 'header', 'عنوان', 'الإجمالي', 'الاجمالي'];
    return keywords.some(keyword => rowStr.includes(keyword));
  }

  /**
   * التحقق من صحة القيم المدخلة
   */
  private static isValidEntry(amount: number, usdtAmount: number): boolean {
    return (
      !isNaN(amount) && 
      !isNaN(usdtAmount) && 
      amount > 0 && 
      usdtAmount > 0 && 
      isFinite(amount) && 
      isFinite(usdtAmount)
    );
  }

  /**
   * استخراج رقم من قيمة نصية أو رقمية
   */
  private static parseNumber(value: any): number {
    if (value === undefined || value === null) return NaN;
    
    if (typeof value === 'number') {
      return isFinite(value) ? value : NaN;
    }
    
    if (typeof value === 'string') {
      // إزالة الفواصل والمسافات والرموز الخاصة
      const cleanValue = value
        .replace(/,/g, '')
        .replace(/٬/g, '') // الفاصلة العربية
        .replace(/[^\d.-]/g, '')
        .trim();
      
      const parsed = parseFloat(cleanValue);
      return isFinite(parsed) ? parsed : NaN;
    }
    
    return NaN;
  }

  /**
   * البحث عن عمود المبلغ بالجنيه
   */
  private static findAmountColumn(headers: string[]): string | null {
    const amountKeywords = [
      'جنيه', 'مصري', 'egp', 'voucher', 'egyptian', 'amount', 'مبلغ', 'vodafone',
      'المبلغ', 'فودافون', 'القيمة', 'value', 'price', 'egp amount', 'السعر', 'سعر',
      'جم', 'ج.م', 'ج.م.', 'جنيه مصري', 'المبلغ المصري', 'القيمة بالجنيه'
    ];
    
    return this.findColumnByKeywords(headers, amountKeywords);
  }

  /**
   * البحث عن عمود كمية USDT
   */
  private static findUsdtColumn(headers: string[]): string | null {
    const usdtKeywords = [
      'usdt', 'يوزد', 'دولار', 'usd', 'dollar', 'tether', 'crypto', 'quantity',
      'digital', 'currency', 'عملة', 'رقمية', 'كمية', 'usdt amount', 'كمية usdt',
      'يو اس دي تي', 'يو إس دي تي', 'تيثر', 'الكمية', 'كمية اليوزد'
    ];
    
    return this.findColumnByKeywords(headers, usdtKeywords);
  }

  /**
   * البحث عن عمود باستخدام الكلمات المفتاحية
   */
  private static findColumnByKeywords(headers: string[], keywords: string[]): string | null {
    // البحث عن تطابق تام
    const exactMatch = headers.find(header => 
      keywords.some(keyword => 
        header.toLowerCase() === keyword.toLowerCase()
      )
    );
    
    if (exactMatch) return exactMatch;
    
    // البحث عن تطابق جزئي
    return headers.find(header => 
      keywords.some(keyword => 
        header.toLowerCase().includes(keyword.toLowerCase())
      )
    ) || null;
  }

  /**
   * معالجة مجموعة من الملفات وإعادة ملخص بالنتائج
   */
  public static async processBatchFiles(files: File[]): Promise<BatchFileSummary> {
    const processedFiles: ProcessedFile[] = [];
    const fileNames: string[] = [];
    let totalEntryCount = 0;
    let filesWithErrors = 0;

    // معالجة كل ملف على حدة
    for (const file of files) {
      try {
        const processedFile = await this.processExcelFile(file);
        processedFiles.push(processedFile);
        fileNames.push(file.name);
        totalEntryCount += processedFile.entryCount;
      } catch (error) {
        console.error(`تم تجاهل الملف ${file.name} بسبب خطأ:`, error);
        filesWithErrors++;
      }
    }

    // التحقق من وجود نتائج
    if (processedFiles.length === 0) {
      throw new Error(`لم يتم معالجة أي ملف بنجاح. تم تجاهل ${filesWithErrors} ملفات بسبب أخطاء.`);
    }

    // حساب الإجماليات
    const totalAmount = processedFiles.reduce((sum, file) => sum + file.totalAmount, 0);
    const totalUsdt = processedFiles.reduce((sum, file) => sum + file.totalUsdt, 0);
    const averagePrice = totalUsdt > 0 ? totalAmount / totalUsdt : 0;

    return {
      totalAmount,
      totalUsdt,
      averagePrice,
      fileCount: processedFiles.length,
      entryCount: totalEntryCount,
      files: fileNames
    };
  }
} 