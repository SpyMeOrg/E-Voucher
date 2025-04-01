import { read, utils } from 'xlsx';
import { BatchFileEntry, BatchFileSummary, ProcessedFile } from '../types/types';

export class FileProcessorService {
  /**
   * معالجة ملف إكسل واستخراج البيانات منه
   */
  public static async processExcelFile(file: File): Promise<ProcessedFile> {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      // البحث عن الأعمدة المطلوبة
      const entries: BatchFileEntry[] = [];
      let totalAmount = 0;
      let totalUsdt = 0;

      if (jsonData.length === 0) {
        return {
          name: file.name,
          path: file.name,
          totalAmount: 0,
          totalUsdt: 0,
          entryCount: 0,
          entries: []
        };
      }

      // استخراج أسماء الأعمدة المحتملة
      const headers = Object.keys(jsonData[0]);
      const amountCol = this.findAmountColumn(headers);
      const usdtCol = this.findUsdtColumn(headers);

      if (!amountCol || !usdtCol) {
        throw new Error(`لم يتم العثور على الأعمدة المطلوبة في الملف: ${file.name}`);
      }

      // معالجة كل صف
      for (const row of jsonData) {
        // تجاهل صفوف الإجمالي
        const rowStr = JSON.stringify(row).toLowerCase();
        if (
          rowStr.includes('total') ||
          rowStr.includes('إجمالي') ||
          rowStr.includes('اجمالي') ||
          rowStr.includes('المجموع')
        ) {
          continue;
        }

        const amount = this.parseNumber(row[amountCol]);
        const usdtAmount = this.parseNumber(row[usdtCol]);

        if (!isNaN(amount) && !isNaN(usdtAmount) && usdtAmount > 0) {
          const price = amount / usdtAmount;
          entries.push({
            fileName: file.name,
            amount,
            usdtAmount,
            price
          });

          totalAmount += amount;
          totalUsdt += usdtAmount;
        }
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
   * معالجة مجموعة من الملفات وإعادة ملخص بالنتائج
   */
  public static async processBatchFiles(files: File[]): Promise<BatchFileSummary> {
    const processedFiles: ProcessedFile[] = [];
    const fileNames: string[] = [];
    let totalEntryCount = 0;

    // معالجة كل ملف على حدة
    for (const file of files) {
      try {
        const processedFile = await this.processExcelFile(file);
        processedFiles.push(processedFile);
        fileNames.push(file.name);
        totalEntryCount += processedFile.entryCount;
      } catch (error) {
        console.error(`تم تجاهل الملف ${file.name} بسبب خطأ:`, error);
      }
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

  /**
   * استخراج رقم من قيمة نصية أو رقمية
   */
  private static parseNumber(value: any): number {
    if (value === undefined || value === null) return NaN;
    
    if (typeof value === 'number') return value;
    
    if (typeof value === 'string') {
      // إزالة الفواصل والمسافات
      const cleanValue = value.replace(/,/g, '').trim();
      return parseFloat(cleanValue);
    }
    
    return NaN;
  }

  /**
   * البحث عن عمود المبلغ بالجنيه
   */
  private static findAmountColumn(headers: string[]): string | null {
    const amountKeywords = [
      'جنيه', 'مصري', 'egp', 'voucher', 'egyptian', 'amount', 'مبلغ', 'vodafone',
      'المبلغ', 'فودافون', 'القيمة', 'value', 'price', 'egp amount'
    ];
    
    // البحث عن عمود بالاسم المطابق تمامًا
    const exactMatch = headers.find(h => 
      h.toLowerCase() === 'egp amount' || 
      h.toLowerCase() === 'amount' || 
      h.toLowerCase() === 'مبلغ' ||
      h.toLowerCase() === 'المبلغ بالجنيه'
    );
    
    if (exactMatch) return exactMatch;
    
    // البحث عن عمود يحتوي على إحدى الكلمات المفتاحية
    return headers.find(header => 
      amountKeywords.some(keyword => 
        header.toLowerCase().includes(keyword.toLowerCase())
      )
    ) || null;
  }

  /**
   * البحث عن عمود كمية USDT
   */
  private static findUsdtColumn(headers: string[]): string | null {
    const usdtKeywords = [
      'usdt', 'يوزد', 'دولار', 'usd', 'dollar', 'tether', 'crypto',
      'digital', 'currency', 'عملة', 'رقمية', 'كمية', 'usdt amount'
    ];
    
    // البحث عن عمود بالاسم المطابق تمامًا
    const exactMatch = headers.find(h => 
      h.toLowerCase() === 'usdt' || 
      h.toLowerCase() === 'usdt amount' || 
      h.toLowerCase() === 'كمية اليوزد'
    );
    
    if (exactMatch) return exactMatch;
    
    // البحث عن عمود يحتوي على إحدى الكلمات المفتاحية
    return headers.find(header => 
      usdtKeywords.some(keyword => 
        header.toLowerCase().includes(keyword.toLowerCase())
      )
    ) || null;
  }
} 