import * as XLSX from 'xlsx';

export interface OrderData {
  referenceNumber: string;
  mobileNumber: string;
  amount: number;
  date: string;
  operator: 'vodafone' | 'etisalat' | 'orange' | 'we' | 'unknown';
  fee: number;
  finalAmount: number;
}

class ExcelService {
  // معالجة ملف Excel
  processExcelBuffer(buffer: Buffer): OrderData[] {
    try {
      // قراءة ملف Excel من البفر
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // الحصول على الورقة الأولى
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // تحويل البيانات إلى مصفوفة من الكائنات
      const rawData = XLSX.utils.sheet_to_json(worksheet);
      
      // معالجة البيانات
      return this.processData(rawData);
    } catch (error) {
      console.error('خطأ في معالجة ملف Excel:', error);
      return [];
    }
  }

  // معالجة البيانات الخام
  private processData(rawData: any[]): OrderData[] {
    return rawData.map((row: any) => {
      // استخراج البيانات من الصفوف
      const referenceNumber = this.extractReferenceNumber(row);
      const mobileNumber = this.formatMobileNumber(this.extractMobileNumber(row));
      const amount = this.extractAmount(row);
      const date = this.extractDate(row);
      
      // تحديد شركة المحمول
      const operator = this.identifyOperator(mobileNumber);
      
      // حساب الرسوم
      const fee = this.calculateFee(amount, operator);
      
      // المبلغ النهائي
      const finalAmount = amount - fee;
      
      return {
        referenceNumber,
        mobileNumber,
        amount,
        date,
        operator,
        fee,
        finalAmount
      };
    });
  }

  // استخراج رقم المرجع
  private extractReferenceNumber(row: any): string {
    // البحث في الحقول المحتملة للعثور على رقم المرجع
    const possibleFields = ['Reference', 'Ref', 'ID', 'رقم العملية', 'المرجع'];
    
    for (const field of possibleFields) {
      if (row[field]) {
        return row[field].toString();
      }
    }
    
    // استخدام أول حقل كحل بديل
    return Object.values(row)[0]?.toString() || 'N/A';
  }

  // استخراج رقم الموبايل
  private extractMobileNumber(row: any): string {
    // البحث في الحقول المحتملة للعثور على رقم الموبايل
    const possibleFields = ['Mobile', 'Phone', 'رقم الموبايل', 'الهاتف', 'Mobile Number'];
    
    for (const field of possibleFields) {
      if (row[field]) {
        return row[field].toString();
      }
    }
    
    return 'N/A';
  }

  // تنسيق رقم الموبايل
  private formatMobileNumber(number: string): string {
    // إزالة المسافات والرموز غير الضرورية
    let formatted = number.replace(/\D/g, '');
    
    // إضافة 0 في البداية إذا لم يكن موجوداً
    if (formatted.length === 10 && !formatted.startsWith('0')) {
      formatted = '0' + formatted;
    }
    
    return formatted;
  }

  // استخراج المبلغ
  private extractAmount(row: any): number {
    // البحث في الحقول المحتملة للعثور على المبلغ
    const possibleFields = ['Amount', 'المبلغ', 'القيمة', 'Payment'];
    
    for (const field of possibleFields) {
      if (row[field]) {
        // تحويل إلى رقم
        const amount = parseFloat(row[field].toString().replace(/[^\d.]/g, ''));
        return isNaN(amount) ? 0 : amount;
      }
    }
    
    return 0;
  }

  // استخراج التاريخ
  private extractDate(row: any): string {
    // البحث في الحقول المحتملة للعثور على التاريخ
    const possibleFields = ['Date', 'التاريخ', 'Created', 'تاريخ الإنشاء'];
    
    for (const field of possibleFields) {
      if (row[field]) {
        // محاولة تنسيق التاريخ
        try {
          const date = new Date(row[field]);
          return date.toISOString().split('T')[0];
        } catch {
          return row[field].toString();
        }
      }
    }
    
    return new Date().toISOString().split('T')[0];
  }

  // تحديد شركة المحمول من رقم الهاتف
  private identifyOperator(mobileNumber: string): 'vodafone' | 'etisalat' | 'orange' | 'we' | 'unknown' {
    if (!mobileNumber || mobileNumber === 'N/A') {
      return 'unknown';
    }
    
    // نمط للتحقق من الأرقام المصرية
    const cleanNumber = mobileNumber.replace(/\D/g, '');
    let prefix: string;
    
    if (cleanNumber.startsWith('0')) {
      prefix = cleanNumber.substring(1, 4);
    } else {
      prefix = cleanNumber.substring(0, 3);
    }
    
    // تحديد الشركة حسب البادئة
    switch (prefix) {
      case '010':
      case '011':
        return 'vodafone';
      case '012':
        return 'orange';
      case '015':
        return 'etisalat';
      case '018':
        return 'we';
      default:
        return 'unknown';
    }
  }

  // حساب الرسوم
  private calculateFee(amount: number, operator: 'vodafone' | 'etisalat' | 'orange' | 'we' | 'unknown'): number {
    if (operator === 'vodafone') {
      // فودافون: 1 جنيه ثابت
      return 1;
    } else {
      // باقي الشركات: 0.5% بحد أقصى 15 جنيه
      const fee = amount * 0.005;
      return Math.min(fee, 15);
    }
  }
}

export const excelService = new ExcelService(); 