import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import crypto from 'crypto';
import https from 'https';

const BINANCE_API_URL = 'https://api.binance.com';

// إنشاء وكيل HTTPS مع خيارات مخصصة
const agent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false // تجاهل شهادات SSL غير الصالحة
});

interface BinanceRequestParams {
  apiKey: string;
  secretKey: string;
  endpoint: string;
  params?: Record<string, string>;
}

const createSignature = (queryString: string, secretKey: string): string => {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
};

export const handler: Handler = async (event) => {
  // إضافة CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // معالجة طلبات OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    if (!event.body) {
      throw new Error('Request body is required');
    }

    const { apiKey, secretKey, endpoint, params = {} } = JSON.parse(event.body) as BinanceRequestParams;

    if (!apiKey || !secretKey) {
      throw new Error('API Key and Secret Key are required');
    }

    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
      ...params,
      timestamp: timestamp.toString(),
      recvWindow: '60000'
    });

    // إضافة signature فقط إذا لم تكن نقطة النهاية هي /api/v3/time
    if (!endpoint.includes('/api/v3/time')) {
      const signature = createSignature(queryParams.toString(), secretKey);
      queryParams.append('signature', signature);
    }

    const requestUrl = `${BINANCE_API_URL}${endpoint}?${queryParams.toString()}`;
    
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'User-Agent': 'Mozilla/5.0', // إضافة User-Agent header
        'Accept': 'application/json'
      },
      agent, // استخدام الوكيل المخصص
      timeout: 30000 // زيادة مهلة الانتظار إلى 30 ثانية
    });

    const responseText = await response.text();
    
    try {
      const data = JSON.parse(responseText);
      
      // التحقق من رسائل الخطأ المحددة من Binance
      if (data.code && data.msg) {
        if (data.code === -1022) {
          throw new Error('Signature for this request is not valid');
        } else if (data.code === -2015) {
          throw new Error('API-key format invalid');
        } else if (data.code === -2014) {
          throw new Error('API-key invalid');
        } else if (data.code === -1021) {
          throw new Error('Timestamp for this request was 1000ms ahead of the server\'s time');
        }
        
        throw new Error(data.msg);
      }

      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify(data)
      };
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new Error('Invalid response format from Binance');
    }

  } catch (error) {
    console.error('Error in binanceApi function:', error);
    
    // تحسين رسائل الخطأ
    let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    let statusCode = 500;

    if (errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Could not connect to Binance API';
      statusCode = 503;
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Request timed out';
      statusCode = 504;
    } else if (errorMessage.includes('restricted location')) {
      errorMessage = 'This service is not available in your region. Please use a VPN.';
      statusCode = 451;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      })
    };
  }
}; 