import React, { useState } from 'react';
import { serverService } from '../services/serverService';

export const OrderTrackingTab: React.FC = () => {
  const [ip, setIp] = useState('');
  const [pemKey, setPemKey] = useState('');
  const [status, setStatus] = useState({ status: 'disconnected' });

  const handleConnect = async () => {
    const result = await serverService.connect(ip, pemKey);
    setStatus(result);
  };

  const handleInstall = async () => {
    const result = await serverService.installDependencies();
    setStatus(result);
  };

  const handleDisconnect = async () => {
    await serverService.disconnect();
    setStatus({ status: 'disconnected' });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-right">تتبع الطلبات</h2>
      
      <div className="space-y-6">
        {/* قسم الاتصال بالسيرفر */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">الاتصال بالسيرفر</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                عنوان IP
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                placeholder="أدخل عنوان IP"
                disabled={status.status !== 'disconnected'}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                مفتاح PEM
              </label>
              <textarea
                value={pemKey}
                onChange={(e) => setPemKey(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right h-32"
                placeholder="أدخل مفتاح PEM"
                disabled={status.status !== 'disconnected'}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-4">
            {status.status === 'disconnected' ? (
              <button
                onClick={handleConnect}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                اتصال
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                قطع الاتصال
              </button>
            )}
          </div>
        </div>

        {/* حالة الاتصال */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">حالة الاتصال</h3>
          
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-medium text-gray-600">
              {status.status === 'connected' && 'متصل'}
              {status.status === 'disconnected' && 'غير متصل'}
              {status.status === 'error' && 'خطأ في الاتصال'}
              {status.status === 'connecting' && 'جاري الاتصال...'}
              {status.status === 'installing' && 'جاري التثبيت...'}
              {status.status === 'installed' && 'تم التثبيت'}
            </span>
            <div 
              className={`w-3 h-3 rounded-full ${
                status.status === 'connected' ? 'bg-green-500' :
                status.status === 'error' ? 'bg-red-500' :
                status.status === 'connecting' || status.status === 'installing' ? 'bg-yellow-500' :
                'bg-gray-500'
              }`}
            />
          </div>

          {status.message && (
            <p className="mt-2 text-sm text-gray-600 text-right">
              {status.message}
            </p>
          )}
        </div>

        {/* أزرار التحكم */}
        {status.status === 'connected' && (
          <div className="flex justify-end gap-4">
            <button
              onClick={handleInstall}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              disabled={status.status === 'installing'}
            >
              {status.status === 'installing' ? 'جاري التثبيت...' : 'تثبيت المكتبات'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}; 