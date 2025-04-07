import React, { useState, useEffect } from 'react';

export const LocalModeTab: React.FC = () => {
  const [isLocalModeActive, setIsLocalModeActive] = useState<boolean>(() => {
    return localStorage.getItem('localModeActive') === 'true';
  });
  const [backendStatus, setBackendStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');

  // التحقق من حالة الخادم المحلي عند تحميل المكون
  useEffect(() => {
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 5000); // التحقق كل 5 ثوانٍ
    return () => clearInterval(interval);
  }, []);

  // حفظ حالة الوضع المحلي
  useEffect(() => {
    localStorage.setItem('localModeActive', isLocalModeActive.toString());
  }, [isLocalModeActive]);

  // التحقق من حالة الخادم الخلفي
  const checkBackendStatus = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000) // وضع مهلة زمنية للطلب
      });
      
      if (response.ok) {
        setBackendStatus('running');
      } else {
        setBackendStatus('stopped');
      }
    } catch (error) {
      setBackendStatus('stopped');
    }
  };

  // تشغيل الخادم المحلي
  const startLocalServer = () => {
    try {
      // استخدام WebSocket بدلاً من البروتوكول المخصص
      const ws = new WebSocket('ws://localhost:5000/ws');
      
      ws.onopen = () => {
        console.log('تم الاتصال بالخادم المحلي');
        setBackendStatus('running');
      };
      
      ws.onclose = () => {
        console.log('تم إغلاق الاتصال بالخادم المحلي');
        setBackendStatus('stopped');
      };
      
      ws.onerror = (error) => {
        console.error('خطأ في الاتصال بالخادم المحلي:', error);
        setBackendStatus('stopped');
      };
    } catch (error) {
      console.error('فشل تشغيل الخادم المحلي:', error);
    }
  };

  // تغيير حالة الوضع المحلي
  const toggleLocalMode = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLocalModeActive(e.target.checked);
  };

  return (
    <div className="relative bg-white backdrop-blur-sm bg-opacity-90 shadow-2xl rounded-2xl p-4 sm:p-8 lg:p-12 mx-auto border border-gray-100 mb-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-right">إدارة الوضع المحلي</h2>
        
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">حالة الخادم المحلي</h3>
          
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={startLocalServer}
              className="group relative inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all text-sm shadow-md hover:shadow-lg hover:shadow-blue-200/50 duration-200 overflow-hidden"
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
              <span className="relative inline-flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                تشغيل الخادم المحلي
              </span>
            </button>
            
            <div className="flex items-center">
              <span className="text-gray-600 ml-3">حالة الخادم:</span>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${
                  backendStatus === 'running' ? 'bg-green-500' : 
                  backendStatus === 'stopped' ? 'bg-red-500' : 'bg-yellow-500'
                }`}></div>
                <span className={`font-medium ${
                  backendStatus === 'running' ? 'text-green-600' : 
                  backendStatus === 'stopped' ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {backendStatus === 'running' ? 'نشط' : 
                   backendStatus === 'stopped' ? 'متوقف' : 'غير معروف'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              تشغيل الخادم المحلي يتيح لك استخدام تبويب بينانس بدون تعارضات مع نتليفاي
            </p>
            
            <div className="form-check form-switch">
              <div className="flex items-center">
                <span className="text-gray-600 ml-3">تفعيل الوضع المحلي:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={isLocalModeActive}
                    onChange={toggleLocalMode}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">معلومات مفيدة</h3>
          
          <div className="space-y-4 text-right">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <h4 className="font-medium text-blue-700 mb-2">كيف يعمل الوضع المحلي؟</h4>
              <p className="text-blue-600 text-sm">
                الوضع المحلي يقوم بتشغيل خادم API محلي على جهازك، مما يسمح للتطبيق بالاتصال به بدلاً من الخادم البعيد. هذا يحل مشكلة التعارض بين بينانس ونتليفاي.
              </p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
              <h4 className="font-medium text-green-700 mb-2">فوائد الوضع المحلي</h4>
              <ul className="text-green-600 text-sm list-disc list-inside space-y-1">
                <li>يعمل مع نطاق أو بدون نطاق</li>
                <li>أمان إضافي حيث تبقى البيانات على جهازك</li>
                <li>أداء أفضل لعمليات معالجة البيانات</li>
                <li>إمكانية العمل دون اتصال بالإنترنت (للوظائف المحلية)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 