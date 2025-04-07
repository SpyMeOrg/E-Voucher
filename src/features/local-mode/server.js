// خادم محلي لتجاوز قيود API بينانس
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const BINANCE_API_URL = 'https://api.binance.com';

// إعداد الأمان
const agent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false
});

// السماح بطلبات CORS من أي مصدر
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Origin', 'X-MBX-APIKEY'],
  credentials: true
}));

app.use(express.json());

// مسار التحقق من حالة الخادم
app.get('/status', (req, res) => {
  res.json({ status: 'running', timestamp: Date.now() });
});

// واجهة WebSocket بسيطة
const wsClients = [];
app.get('/ws', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const clientId = Date.now();
  const client = {
    id: clientId,
    send: (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  };
  
  wsClients.push(client);
  
  client.send({ type: 'connection', message: 'WebSocket connection established', clientId });
  
  req.on('close', () => {
    const index = wsClients.findIndex(c => c.id === clientId);
    if (index !== -1) {
      wsClients.splice(index, 1);
    }
  });
});

// إنشاء توقيع للطلبات المرسلة إلى بينانس
const createSignature = (queryString, secretKey) => {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
};

// الوسيط الرئيسي للـAPI
app.post('/.netlify/functions/binanceApi', async (req, res) => {
  try {
    const { apiKey, secretKey, endpoint, params = {} } = req.body;

    if (!apiKey || !secretKey) {
      return res.status(400).json({ error: 'API Key and Secret Key are required' });
    }

    console.log(`Processing request to endpoint: ${endpoint}`);
    
    let requestUrl = `${BINANCE_API_URL}${endpoint}`;
    
    if (endpoint === '/api/v3/time') {
      requestUrl = `${BINANCE_API_URL}/api/v3/time`;
    } else {
      const timestamp = Date.now();
      const queryParams = new URLSearchParams({
        ...params,
        timestamp: timestamp.toString(),
        recvWindow: '60000'
      });

      const signature = createSignature(queryParams.toString(), secretKey);
      queryParams.append('signature', signature);
      requestUrl += `?${queryParams.toString()}`;
    }

    console.log(`Forwarding request to: ${requestUrl}`);

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (endpoint !== '/api/v3/time') {
      requestHeaders['X-MBX-APIKEY'] = apiKey;
    }

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: requestHeaders,
        agent,
        timeout: 30000
      });

      console.log(`Response status: ${response.status}`);
      const responseText = await response.text();
      
      try {
        if (responseText.trim() === '') {
          return res.status(502).json({ 
            error: 'Empty response from Binance API',
            endpoint: endpoint
          });
        }
        
        const data = JSON.parse(responseText);
        return res.status(response.status).json(data);
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        return res.status(502).json({
          error: 'Invalid response format from Binance API',
          rawResponse: responseText,
          parseError: parseError.message
        });
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(502).json({ 
        error: 'Failed to fetch from Binance API',
        details: fetchError.message,
        url: requestUrl 
      });
    }
  } catch (error) {
    console.error('Error in binanceApi function:', error);
    return res.status(500).json({ error: error.message });
  }
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`Local server running on port ${PORT}`);
  
  // إنشاء ملف السجل
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'server.log');
  fs.writeFileSync(logFile, `Server started at ${new Date().toISOString()}\n`);
  
  // إعلام المستخدم
  console.log(`
  ====================================================
    تم تشغيل الخادم المحلي لتجاوز قيود API بينانس
    استخدم الوضع المحلي في التطبيق للاتصال بهذا الخادم
  ====================================================
  `);
}); 