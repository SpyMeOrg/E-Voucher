export interface BatchFileEntry {
  fileName: string;
  amount: number;
  usdtAmount: number;
  price: number;
}

export interface BatchFileSummary {
  totalAmount: number;
  totalUsdt: number;
  averagePrice: number;
  fileCount: number;
  entryCount: number;
  files: string[];
}

export interface ProcessedFile {
  name: string;
  path: string;
  totalAmount: number;
  totalUsdt: number;
  entryCount: number;
  entries: BatchFileEntry[];
} 