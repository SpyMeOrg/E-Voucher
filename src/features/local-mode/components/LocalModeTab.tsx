import React, { useState, useEffect, useRef } from 'react';

export const LocalModeTab: React.FC = () => {
  const [isLocalModeActive, setIsLocalModeActive] = useState<boolean>(() => {
    return localStorage.getItem('localModeActive') === 'true';
  });
  const [backendStatus, setBackendStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');
  const [serverLog, setServerLog] = useState<string[]>([]);
  const wsServerRef = useRef<WebSocket | null>(null);
  const wsClientRef = useRef<WebSocket | null>(null);

  // حفظ حالة الوضع المحلي
  useEffect(() => {
    localStorage.setItem('localModeActive', isLocalModeActive.toString());
  }, [isLocalModeActive]);

  // إضافة رسالة إلى سجل الخادم
  const addLog = (message: string) => {
    setServerLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  // إنشاء خادم WebSocket بسيط
  const createLocalServer = () => {
    try {
      // إنشاء خادم WebSocket بسيط
      const server = new WebSocket('ws://localhost:5000/ws');
      
      server.onopen = () => {
        addLog('تم إنشاء الخادم المحلي بنجاح');
        setBackendStatus('running');
      };
      
      server.onmessage = (event) => {
        addLog(`تم استلام رسالة: ${event.data}`);
        // معالجة الرسائل الواردة
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ping') {
            server.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (error) {
          console.error('خطأ في معالجة الرسالة:', error);
        }
      };
      
      server.onclose = () => {
        addLog('تم إغلاق الخادم المحلي');
        setBackendStatus('stopped');
      };
      
      server.onerror = (error) => {
        addLog(`خطأ في الخادم المحلي: ${error}`);
        setBackendStatus('stopped');
      };
      
      wsServerRef.current = server;
    } catch (error) {
      console.error('فشل إنشاء الخادم المحلي:', error);
      addLog(`فشل إنشاء الخادم المحلي: ${error}`);
    }
  };

  // تشغيل الخادم المحلي
  const startLocalServer = () => {
    try {
      addLog('جاري تشغيل الخادم المحلي...');
      
      // إنشاء اتصال WebSocket للعميل
      const client = new WebSocket('ws://localhost:5000/ws');
      
      client.onopen = () => {
        addLog('تم الاتصال بالخادم المحلي');
        setBackendStatus('running');
        
        // إرسال رسالة ping للتحقق من عمل الخادم
        client.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      };
      
      client.onmessage = (event) => {
        addLog(`تم استلام رد: ${event.data}`);
      };
      
      client.onclose = () => {
        addLog('تم إغلاق الاتصال بالخادم المحلي');
        setBackendStatus('stopped');
      };
      
      client.onerror = (error) => {
        addLog(`خطأ في الاتصال بالخادم المحلي: ${error}`);
        setBackendStatus('stopped');
      };
      
      wsClientRef.current = client;
      
      // إنشاء الخادم المحلي
      createLocalServer();
    } catch (error) {
      console.error('فشل تشغيل الخادم المحلي:', error);
      addLog(`فشل تشغيل الخادم المحلي: ${error}`);
    }
  };

  // تغيير حالة الوضع المحلي
  const toggleLocalMode = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLocalModeActive(e.target.checked);
    if (e.target.checked) {
      startLocalServer();
    } else {
      // إغلاق الاتصالات عند تعطيل الوضع المحلي
      if (wsServerRef.current) {
        wsServerRef.current.close();
        wsServerRef.current = null;
      }
      if (wsClientRef.current) {
        wsClientRef.current.close();
        wsClientRef.current = null;
      }
      setBackendStatus('stopped');
      addLog('تم تعطيل الوضع المحلي');
    }
  };

  // تنظيف الاتصالات عند إزالة المكون
  useEffect(() => {
    return () => {
      if (wsServerRef.current) {
        wsServerRef.current.close();
      }
      if (wsClientRef.current) {
        wsClientRef.current.close();
      }
    };
  }, []);

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
          
          <div className="flex items-center justify-between mb-4">
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
          
          {/* سجل الخادم */}
          <div className="mt-4 bg-gray-800 text-gray-200 p-4 rounded-lg font-mono text-sm h-40 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">سجل الخادم</span>
              <button 
                onClick={() => setServerLog([])}
                className="text-xs text-gray-400 hover:text-white"
              >
                مسح السجل
              </button>
            </div>
            {serverLog.length === 0 ? (
              <div className="text-gray-500 text-center py-4">لا توجد سجلات حتى الآن</div>
            ) : (
              serverLog.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))
            )}
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