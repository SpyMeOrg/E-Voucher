import { utils, writeFile } from 'xlsx';

interface ImportedRow {
  Reference: string;
  Created: string;
  'Mobile Number': string;
  Amount: string | number;
  'Voucher Amount': string | number;
  Rate: string | number;
  Status: string;
}

interface ExportRow {
  'Reference': string;
  'Date': string;
  'Mobile Number': string;
  'AED Amount': string | number;
  'EGP Amount': string | number;
  'AED / EGP': string | number;
  'USDT': string | number;
  'USDT Rate': string | number;
  'Status': string;
}

export const exportToExcel = (_amounts: string, importedData: ImportedRow[], usdtEGPRate?: string) => {
  if (!importedData || importedData.length === 0) {
    alert('لا توجد بيانات للتصدير');
    return;
  }

  try {
    // تحضير البيانات للتصدير
    const rows: ExportRow[] = importedData.map(row => {
      // تنظيف المبالغ من الفواصل والمسافات
      const aedAmount = parseFloat(row.Amount?.toString().replace(/,/g, '') || '0');
      const egpAmount = parseFloat(row['Voucher Amount']?.toString().replace(/,/g, '') || '0');
      const rate = parseFloat(row.Rate?.toString().replace(/,/g, '') || '0');
      const usdtRate = parseFloat(usdtEGPRate || '0');

      // حساب قيمة USDT من خلال قسمة EGP Amount على USDT Rate
      const usdtAmount = !isNaN(egpAmount) && !isNaN(usdtRate) && usdtRate > 0 
        ? Number((egpAmount / usdtRate).toFixed(2))
        : '';

      return {
        'Reference': row.Reference || '',
        'Date': row.Created || '',
        'Mobile Number': row['Mobile Number'] || '',
        'AED Amount': isNaN(aedAmount) ? '' : aedAmount,
        'EGP Amount': isNaN(egpAmount) ? '' : egpAmount,
        'AED / EGP': isNaN(rate) ? '' : rate,
        'USDT': usdtAmount,
        'USDT Rate': usdtRate || '',
        'Status': row.Status || ''
      };
    });

    // إضافة صف الإجمالي
    const totalRow: ExportRow = {
      'Reference': 'Total',
      'Date': '',
      'Mobile Number': '',
      'AED Amount': rows.reduce((sum, row) => {
        const val = typeof row['AED Amount'] === 'number' ? row['AED Amount'] : 0;
        return sum + val;
      }, 0),
      'EGP Amount': rows.reduce((sum, row) => {
        const val = typeof row['EGP Amount'] === 'number' ? row['EGP Amount'] : 0;
        return sum + val;
      }, 0),
      'AED / EGP': rows.find(row => typeof row['AED / EGP'] === 'number')?.['AED / EGP'] || '',
      'USDT': Number(rows.reduce((sum, row) => {
        const val = typeof row['USDT'] === 'number' ? row['USDT'] : 0;
        return sum + val;
      }, 0).toFixed(2)),
      'USDT Rate': parseFloat(usdtEGPRate || '0') || '',
      'Status': ''
    };

    rows.push(totalRow);

    // إنشاء ورقة عمل جديدة
    const worksheet = utils.json_to_sheet(rows, {
      header: [
        'Reference',
        'Date',
        'Mobile Number',
        'AED Amount',
        'EGP Amount',
        'AED / EGP',
        'USDT',
        'USDT Rate',
        'Status'
      ]
    });

    // إضافة صيغة حساب USDT لكل صف
    const range = utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R < range.e.r; R++) { // نستثني الصف الأخير (Total)
      const egpAmountCell = utils.encode_cell({ r: R, c: 4 }); // عمود EGP Amount
      const usdtRateCell = utils.encode_cell({ r: R, c: 7 }); // عمود USDT Rate
      const usdtCell = utils.encode_cell({ r: R, c: 6 }); // عمود USDT

      // إضافة صيغة حساب USDT
      worksheet[usdtCell] = { 
        t: 'n', 
        f: `IF(AND(ISNUMBER(${egpAmountCell}),ISNUMBER(${usdtRateCell}),${usdtRateCell}<>0),ROUND(${egpAmountCell}/${usdtRateCell},2),"")`
      };
    }

    // إضافة صيغة SUM لصف التوتال
    const lastRow = range.e.r;
    const usdtCell = utils.encode_cell({ r: lastRow, c: 6 }); // عمود USDT في صف التوتال
    worksheet[usdtCell] = {
      t: 'n',
      f: `SUMIF(G2:G${lastRow},"<>",G2:G${lastRow})`
    };

    // إنشاء الملف
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Transactions');

    // حفظ الملف
    writeFile(workbook, 'transactions.xlsx');
  } catch (error) {
    console.error('خطأ في تصدير الملف:', error);
    alert('حدث خطأ أثناء تصدير الملف');
  }
};
