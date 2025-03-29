import React, { useState } from 'react';
import { serverService } from '../services/serverService';
import { ServerStatus } from '../types/server';
import { whatsappService } from '../services/whatsappService';

export const OrderTrackingTab: React.FC = () => {
  const [ip, setIp] = useState('');
  const [pemKey, setPemKey] = useState('');
  const [status, setStatus] = useState<ServerStatus>({ status: 'disconnected' });
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');

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

  const handleAddNumber = () => {
    if (newNumber && !whatsappNumbers.includes(newNumber)) {
      setWhatsappNumbers([...whatsappNumbers, newNumber]);
      whatsappService.setNumbers([...whatsappNumbers, newNumber]);
      setNewNumber('');
    }
  };

  const handleRemoveNumber = (index: number) => {
    const updatedNumbers = whatsappNumbers.filter((_, i) => i !== index);
    setWhatsappNumbers(updatedNumbers);
    whatsappService.setNumbers(updatedNumbers);
  };

  const handleActivateWhatsapp = (active: boolean) => {
    whatsappService.setActive(active);
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
                status.status === 'connected' || status.status === 'installed' ? 'bg-green-500' :
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

        {/* إعدادات الواتساب */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">إعدادات الواتساب</h3>
          
          <div className="space-y-4">
            <div className="flex space-x-2 flex-row-reverse">
              <input
                type="text"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                placeholder="أدخل رقم الواتساب مع كود الدولة"
                dir="rtl"
              />
              <button
                onClick={handleAddNumber}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                إضافة
              </button>
            </div>

            <div className="space-y-2">
              {whatsappNumbers.map((number, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-100 p-3 rounded-lg">
                  <button
                    onClick={() => handleRemoveNumber(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    حذف
                  </button>
                  <span className="text-right font-medium">{number}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end items-center mt-4">
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  onChange={(e) => handleActivateWhatsapp(e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ms-3 text-sm font-medium text-gray-900">تفعيل إشعارات الواتساب</span>
              </label>
            </div>
          </div>
        </div>

        {/* أزرار التحكم */}
        <div className="flex justify-end gap-4">
          {(() => {
            const isConnectedOrInstalled = status.status === 'connected' || status.status === 'installed';
            const isInstalling = status.status === 'installing';
            const isInstalled = status.status === 'installed';

            return isConnectedOrInstalled && (
              <button
                onClick={handleInstall}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
                disabled={isInstalling || isInstalled}
              >
                {isInstalling ? 'جاري التثبيت...' : isInstalled ? 'تم التثبيت' : 'تثبيت المكتبات'}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}; 