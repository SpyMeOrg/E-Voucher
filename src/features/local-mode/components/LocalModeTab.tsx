import React, { useState, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';

// كلاس محاكاة خادم WebSocket محلي
class MockWebSocketServer {
  private clients: Array<{
    send: (data: string) => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
  }> = [];
  
  private isRunning = false;
  private onStatusChange?: (status: 'running' | 'stopped') => void;
  private onLog?: (message: string) => void;
  
  constructor(onStatusChange?: (status: 'running' | 'stopped') => void, onLog?: (message: string) => void) {
    this.onStatusChange = onStatusChange;
    this.onLog = onLog;
  }
  
  start() {
    this.isRunning = true;
    this.onLog?.('تم تشغيل الخادم المحلي المحاكي');
    this.onStatusChange?.('running');
    return true;
  }
  
  stop() {
    this.isRunning = false;
    this.clients.forEach(client => client.onclose?.());
    this.clients = [];
    this.onLog?.('تم إيقاف الخادم المحلي المحاكي');
    this.onStatusChange?.('stopped');
  }
  
  connect() {
    if (!this.isRunning) {
      throw new Error('الخادم غير مشغل');
    }
    
    this.onLog?.('تم اتصال عميل جديد بالخادم المحلي');
    
    const mockSocket = {
      send: (data: string) => {
        this.onLog?.(`العميل أرسل: ${data}`);
        if (this.isRunning) {
          try {
            const parsedData = JSON.parse(data);
            if (parsedData.type === 'ping') {
              setTimeout(() => {
                mockSocket.onmessage?.({
                  data: JSON.stringify({
                    type: 'pong',
                    timestamp: Date.now(),
                    message: 'الخادم المحلي يعمل'
                  })
                });
              }, 500);
            }
          } catch (e) {
            console.error('خطأ في معالجة البيانات:', e);
          }
        }
      },
      onmessage: undefined as ((event: { data: string }) => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      close: () => {
        const index = this.clients.indexOf(mockSocket);
        if (index > -1) {
          this.clients.splice(index, 1);
          this.onLog?.('تم إغلاق اتصال العميل بالخادم المحلي');
          mockSocket.onclose?.();
        }
      }
    };
    
    this.clients.push(mockSocket);
    return mockSocket;
  }
  
  isActive() {
    return this.isRunning;
  }
}

// المكون الرئيسي
export const LocalModeTab: React.FC = () => {
  const [isLocalModeActive, setIsLocalModeActive] = useState<boolean>(() => {
    return localStorage.getItem('localModeActive') === 'true';
  });
  const [backendStatus, setBackendStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');
  const [serverLog, setServerLog] = useState<string[]>([]);
  const [useRealServer, setUseRealServer] = useState<boolean>(false);
  const [isServerDownloaded, setIsServerDownloaded] = useState<boolean>(false);
  const serverRef = useRef<MockWebSocketServer | null>(null);
  const clientRef = useRef<ReturnType<MockWebSocketServer['connect']> | null>(null);
  const checkStatusIntervalRef = useRef<number | null>(null);

  // إعداد الخادم المحاكي عند تحميل المكون
  useEffect(() => {
    // التحقق من تنزيل الخادم المحلي
    const checkServerDownloaded = () => {
      // في الإنتاج، قد تحتاج لوضع منطق للتحقق من وجود الملف المحلي
      // لكن في الوقت الحالي، نحاول فقط التواصل مع الخادم
      fetch('http://localhost:3001/status', { 
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      })
        .then(response => {
          if (response.ok) {
            setIsServerDownloaded(true);
            setUseRealServer(true);
            return response.json();
          }
          throw new Error('الخادم غير متوفر');
        })
        .then(data => {
          if (data.status === 'running') {
            setBackendStatus('running');
            addLog('تم العثور على الخادم المحلي: نشط');
            setIsLocalModeActive(true);
            localStorage.setItem('localModeActive', 'true');
          }
        })
        .catch(() => {
          // الخادم الحقيقي غير موجود، استخدم المحاكي
          setUseRealServer(false);
          serverRef.current = new MockWebSocketServer(
            (status) => setBackendStatus(status),
            (message) => addLog(message)
          );
        });
    };

    checkServerDownloaded();
    
    // تحقق من الحالة المحفوظة
    if (isLocalModeActive) {
      if (useRealServer) {
        startRealServer();
      } else {
        setTimeout(() => startLocalServer(), 500);
      }
    }
    
    // بدء فحص دوري لحالة الخادم
    checkStatusIntervalRef.current = window.setInterval(() => {
      if (useRealServer) {
        checkRealServerStatus();
      }
    }, 5000);
    
    return () => {
      if (checkStatusIntervalRef.current) {
        window.clearInterval(checkStatusIntervalRef.current);
      }
      
      if (serverRef.current?.isActive()) {
        serverRef.current.stop();
      }
    };
  }, []);

  // حفظ حالة الوضع المحلي
  useEffect(() => {
    localStorage.setItem('localModeActive', isLocalModeActive.toString());
    
    // عند تغيير الحالة، قم بتحديث الإعدادات في الخدمات
    const event = new CustomEvent('localModeChanged', { 
      detail: { active: isLocalModeActive } 
    });
    window.dispatchEvent(event);
    
  }, [isLocalModeActive]);

  // إضافة رسالة إلى سجل الخادم
  const addLog = (message: string) => {
    setServerLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  // التحقق من حالة الخادم الحقيقي
  const checkRealServerStatus = () => {
    fetch('http://localhost:3001/status', { 
      method: 'GET',
      signal: AbortSignal.timeout(1000)
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('الخادم غير متوفر');
      })
      .then(data => {
        if (data.status === 'running') {
          setBackendStatus('running');
        } else {
          setBackendStatus('stopped');
        }
      })
      .catch(() => {
        setBackendStatus('stopped');
      });
  };

  // تشغيل الخادم المحلي
  const startLocalServer = () => {
    if (useRealServer) {
      startRealServer();
      return;
    }
    
    try {
      addLog('جاري تشغيل الخادم المحلي...');
      
      if (!serverRef.current) {
        serverRef.current = new MockWebSocketServer(
          (status) => setBackendStatus(status),
          (message) => addLog(message)
        );
      }
      
      if (serverRef.current.isActive()) {
        addLog('الخادم المحلي مشغل بالفعل');
      } else {
        // تشغيل الخادم المحاكي
        const success = serverRef.current.start();
        
        if (success) {
          try {
            // اتصال عميل بالخادم المحلي
            clientRef.current = serverRef.current.connect();
            
            clientRef.current.onmessage = (event) => {
              addLog(`تم استلام رد: ${event.data}`);
            };
            
            clientRef.current.onclose = () => {
              addLog('تم إغلاق الاتصال بالخادم المحلي');
              setBackendStatus('stopped');
            };
            
            // إرسال رسالة ping للتحقق
            clientRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            
            setIsLocalModeActive(true);
          } catch (error) {
            addLog(`خطأ في الاتصال بالخادم المحلي: ${error}`);
            setBackendStatus('stopped');
          }
        }
      }
    } catch (error) {
      console.error('فشل تشغيل الخادم المحلي:', error);
      addLog(`فشل تشغيل الخادم المحلي: ${error}`);
    }
  };

  // تشغيل الخادم الحقيقي
  const startRealServer = () => {
    if (!isServerDownloaded) {
      addLog('الخادم المحلي غير مثبت. يرجى تنزيله أولاً.');
      return;
    }
    
    addLog('جاري تشغيل الخادم المحلي الحقيقي...');
    
    // في الإنتاج، سنستخدم البروتوكول المخصص
    // window.location.href = 'binance-local://start';
    
    // للاختبار، فقط نحاول الاتصال بالخادم
    fetch('http://localhost:3001/status', { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('فشل الاتصال بالخادم');
      })
      .then(data => {
        addLog(`تم الاتصال بالخادم المحلي: ${JSON.stringify(data)}`);
        setBackendStatus('running');
        setIsLocalModeActive(true);
      })
      .catch(error => {
        addLog(`فشل تشغيل الخادم المحلي: ${error.message}`);
        setBackendStatus('stopped');
      });
  };

  // تنزيل الخادم المحلي
  const downloadServer = () => {
    addLog('جاري تحضير ملف الخادم المحلي للتنزيل...');
    
    // في الإنتاج، هنا سنقوم بتنزيل الملف الحقيقي من خادم آخر
    // لكن للتبسيط، نقوم بإنشاء ملف نصي يحتوي على كود الخادم المحلي
    
    fetch('/src/features/local-mode/server.js')
      .then(response => response.text())
      .then(serverCode => {
        // إنشاء ملف نصي
        const blob = new Blob([serverCode], { type: 'text/javascript' });
        
        // تنزيل الملف
        saveAs(blob, 'BinanceLocalServer.js');
        
        addLog('تم تنزيل ملف الخادم المحلي. يرجى تثبيته وتشغيله.');
        setIsServerDownloaded(true);
      })
      .catch(error => {
        addLog(`فشل تنزيل الخادم المحلي: ${error.message}`);
      });
  };

  // إنشاء ملف تنفيذي
  const createExecutable = () => {
    addLog('جاري إنشاء ملف تنفيذي...');
    
    // محتوى ملف BAT للويندوز
    const batFileContent = `
@echo off
echo تشغيل الخادم المحلي لـ Binance...
cd %~dp0
IF NOT EXIST node_modules (
  echo تثبيت الحزم المطلوبة...
  npm install express cors node-fetch@2 crypto-js
)
node server.js
pause
    `.trim();
    
    // إنشاء ملف BAT
    const blob = new Blob([batFileContent], { type: 'application/bat' });
    saveAs(blob, 'StartBinanceServer.bat');
    
    addLog('تم إنشاء ملف تنفيذي. قم بوضعه في نفس مجلد ملف الخادم.');
  };

  // تغيير حالة الوضع المحلي
  const toggleLocalMode = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLocalModeActive(e.target.checked);
    if (e.target.checked) {
      if (useRealServer) {
        startRealServer();
      } else {
        startLocalServer();
      }
    } else {
      // إيقاف الخادم المحلي
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
      
      if (serverRef.current) {
        serverRef.current.stop();
      }
      
      setBackendStatus('stopped');
      addLog('تم تعطيل الوضع المحلي');
    }
  };

  return (
    <div className="relative bg-white backdrop-blur-sm bg-opacity-90 shadow-2xl rounded-2xl p-4 sm:p-8 lg:p-12 mx-auto border border-gray-100 mb-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-right">إدارة الوضع المحلي</h2>
        
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 text-right">حالة الخادم المحلي</h3>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex space-x-2">
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
              
              {!isServerDownloaded && (
                <button
                  onClick={downloadServer}
                  className="group relative inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all text-sm shadow-md hover:shadow-lg hover:shadow-green-200/50 duration-200 overflow-hidden"
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
                  <span className="relative inline-flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    تنزيل الخادم المحلي
                  </span>
                </button>
              )}
              
              {isServerDownloaded && (
                <button
                  onClick={createExecutable}
                  className="group relative inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all text-sm shadow-md hover:shadow-lg hover:shadow-purple-200/50 duration-200 overflow-hidden"
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
                  <span className="relative inline-flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transform group-hover:scale-110 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clipRule="evenodd" />
                    </svg>
                    إنشاء ملف تنفيذي
                  </span>
                </button>
              )}
            </div>
            
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
          
          {/* إرشادات التثبيت */}
          {isServerDownloaded && (
            <div className="mt-4 mb-4 bg-amber-50 p-4 rounded-lg border border-amber-100">
              <h4 className="font-medium text-amber-700 mb-2 text-right">تعليمات التثبيت</h4>
              <ol className="text-amber-600 text-sm list-decimal list-inside space-y-1 text-right">
                <li>قم بتنزيل ملف الخادم المحلي بالضغط على "تنزيل الخادم المحلي"</li>
                <li>قم بإنشاء ملف تنفيذي بالضغط على "إنشاء ملف تنفيذي"</li>
                <li>ضع الملفين في مجلد واحد على جهازك</li>
                <li>قم بتشغيل الملف التنفيذي (StartBinanceServer.bat)</li>
                <li>انتظر حتى يتم تشغيل الخادم (ستظهر نافذة سوداء)</li>
                <li>ارجع إلى هذه الصفحة واضغط على "تشغيل الخادم المحلي" للتحقق من الاتصال</li>
              </ol>
            </div>
          )}
          
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
                {useRealServer 
                  ? 'الوضع المحلي يقوم بتشغيل خادم API محلي على جهازك، مما يسمح للتطبيق بالاتصال ببينانس من جهازك بدلاً من الخادم البعيد. هذا يحل مشكلة تقييد الموقع الجغرافي الذي تفرضه بينانس.'
                  : 'الوضع المحلي يقوم بتشغيل محاكاة لخادم API محلي في المتصفح نفسه، مما يسمح للتطبيق بمعالجة البيانات محليًا. هذا يحل مشكلة التعارض بين بينانس ونتليفاي دون الحاجة لتثبيت أي برامج.'}
              </p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
              <h4 className="font-medium text-green-700 mb-2">فوائد الوضع المحلي</h4>
              <ul className="text-green-600 text-sm list-disc list-inside space-y-1">
                <li>{useRealServer 
                  ? 'يحل مشكلة القيود الجغرافية (رمز الخطأ 451)'
                  : 'يعمل مباشرة في المتصفح بدون أي متطلبات خارجية'}</li>
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