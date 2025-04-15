import React from 'react';
import { EVoucherSummary as EVoucherSummaryType } from '../types/types';

interface Props {
  summary: EVoucherSummaryType;
}

export const EVoucherSummary: React.FC<Props> = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* المبالغ الإجمالية */}
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">إجمالي المبلغ بالجنيه المصري</div>
          <div className="text-lg font-bold text-gray-900">{summary.totalEGP.toFixed(4)} EGP</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">إجمالي المبلغ بالدرهم الإماراتي</div>
          <div className="text-lg font-bold text-gray-900">{summary.totalAED.toFixed(4)} AED</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">إجمالي USDT المستخدم</div>
          <div className="text-lg font-bold text-gray-900">{summary.totalUSDT.toFixed(4)} USDT</div>
        </div>
      </div>

      {/* متوسط الأسعار */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="text-sm text-gray-500 mb-3">متوسط أسعار الصرف</div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">سعر الدرهم مقابل الجنيه</div>
            <div className="text-lg font-bold text-gray-900">
              1 AED = {summary.avgAEDtoEGP.toFixed(4)} EGP
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <div className="text-sm text-gray-500 mb-1">سعر USDT مقابل الجنيه</div>
            <div className="text-lg font-bold text-gray-900">
              1 USDT = {summary.avgUSDTtoEGP.toFixed(4)} EGP
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 