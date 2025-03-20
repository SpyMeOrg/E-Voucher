import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import crypto from 'crypto';
import https from 'https';

const BINANCE_API_URL = 'https://api.binance.com';
const PROXY_URL = 'https://proxy.cors.sh/';

const agent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false
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
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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

    let requestUrl = `${BINANCE_API_URL}${endpoint}`;
    let queryString = '';

    // معالجة خاصة لطلب وقت الخادم
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
      queryString = `?${queryParams.toString()}`;
      requestUrl += queryString;
    }

    // استخدام proxy فقط على الدومين وليس على localhost
    const isLocalhost = event.headers.host?.includes('localhost');
    const finalUrl = isLocalhost ? requestUrl : `${PROXY_URL}${encodeURIComponent(requestUrl)}`;

    console.log('Making request to:', finalUrl);

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'x-cors-api-key': 'temp_f0f7c88a358d2a3e2b7e1f82a3f4c33a', // مفتاح مجاني للـ proxy
    };

    if (endpoint !== '/api/v3/time') {
      requestHeaders['X-MBX-APIKEY'] = apiKey;
    }

    if (!isLocalhost) {
      requestHeaders['origin'] = 'https://evoucher.netlify.app';
    }

    console.log('Request headers:', requestHeaders);

    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: requestHeaders,
      agent,
      timeout: 30000
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response:', parseError);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Invalid response format from Binance API',
          rawResponse: responseText
        })
      };
    }

    if (data.code && data.msg) {
      console.log('Binance error response:', data);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: data.msg,
          code: data.code
        })
      };
    }

    // التحقق من نوع الاستجابة بناءً على نقطة النهاية
    if (endpoint === '/api/v3/time') {
      if (typeof data.serverTime !== 'number') {
        console.error('Invalid server time response:', data);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({
            error: 'Invalid server time response format',
            data
          })
        };
      }
    } else if (endpoint.includes('orderMatch/listUserOrderHistory')) {
      if (!data.data || !Array.isArray(data.data)) {
        console.error('Invalid orders response:', data);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({
            error: 'Invalid orders response format',
            data
          })
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Error in binanceApi function:', error);
    
    let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    let statusCode = 500;

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ECONNRESET')) {
      errorMessage = 'Could not connect to Binance API';
      statusCode = 503;
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Request timed out';
      statusCode = 504;
    } else if (errorMessage.includes('restricted location')) {
      errorMessage = 'This service is not available in your region. Please try again later.';
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