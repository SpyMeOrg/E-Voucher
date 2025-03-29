export type Operator = 'vodafone' | 'etisalat' | 'orange' | 'we' | 'unknown';
export type OrderStatus = 'new' | 'processed' | 'completed' | 'failed';

export interface Order {
  id: number;
  referenceNumber: string;
  mobileNumber: string;
  amount: number;
  date: string;
  operator: Operator;
  fee: number;
  finalAmount: number;
  status: OrderStatus;
  processedAt?: string;
  notes?: string;
}

export interface OrdersFilter {
  status?: OrderStatus;
  operator?: Operator;
  startDate?: string;
  endDate?: string;
  mobileNumber?: string;
  referenceNumber?: string;
} 