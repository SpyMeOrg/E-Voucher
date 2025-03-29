import React, { useState } from 'react';
import { serverService } from '../services/serverService';
import { ServerStatus } from '../types/server';

export const OrderTracking: React.FC = () => {
  const [serverIP, setServerIP] = useState('');
  const [pemKey, setPemKey] = useState('');
  const [status, setStatus] = useState<ServerStatus>({ status: 'disconnected' });
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');

  const handleConnect = async () => {
    const result = await serverService.connect(serverIP, pemKey);
    setStatus(result);
  };

  const handleInstall = async () => {
    const result = await serverService.installDependencies();
    setStatus(result);
  };

  const handleAddNumber = () => {
    if (newNumber && !whatsappNumbers.includes(newNumber)) {
      setWhatsappNumbers([...whatsappNumbers, newNumber]);
      setNewNumber('');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">إعدادات تتبع الأوردرات</h2>
      
      {/* إعدادات السيرفر */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h3 className="text-xl font-semibold mb-2">إعدادات السيرفر</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">IP السيرفر</label>
            <input
              type="text"
              value={serverIP}
              onChange={(e) => setServerIP(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="مثال: 123.45.67.89"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">مفتاح PEM</label>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setPemKey(event.target?.result as string);
                  };
                  reader.readAsText(file);
                }
              }}
              className="mt-1 block w-full"
              accept=".pem"
            />
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleConnect}
              disabled={status.status === 'connecting'}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {status.status === 'connecting' ? 'جاري الاتصال...' : 'اتصال بالسيرفر'}
            </button>

            <button
              onClick={handleInstall}
              disabled={status.status !== 'connected'}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              {status.status === 'installing' ? 'جاري التثبيت...' : 'تثبيت المكتبات'}
            </button>
          </div>

          {status.message && (
            <div className={`p-2 rounded ${
              status.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {status.message}
            </div>
          )}
        </div>
      </div>

      {/* إعدادات الواتساب */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-2">إعدادات الواتساب</h3>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="أدخل رقم الواتساب"
            />
            <button
              onClick={handleAddNumber}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              إضافة
            </button>
          </div>

          <div className="space-y-2">
            {whatsappNumbers.map((number, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <span>{number}</span>
                <button
                  onClick={() => setWhatsappNumbers(whatsappNumbers.filter((_, i) => i !== index))}
                  className="text-red-500 hover:text-red-700"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}; 