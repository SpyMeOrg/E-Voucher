import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import crypto from 'crypto';
import https from 'https';

const BINANCE_API_URL = 'https://api.binance.com';

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
      requestUrl += `?${queryParams.toString()}`;
    }

    console.log('Making request to:', requestUrl);

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (endpoint !== '/api/v3/time') {
      requestHeaders['X-MBX-APIKEY'] = apiKey;
    }

    console.log('Request headers:', requestHeaders);

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: requestHeaders,
      agent,
      timeout: 30000
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    try {
      const data = JSON.parse(responseText);

      // التحقق من وجود خطأ في الرد
      if (data.code && data.msg) {
        console.log('Binance error response:', data);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({
            error: data.msg,
            code: data.code
          })
        };
      }

      // التحقق من صحة البيانات
      if (endpoint === '/api/v3/time') {
        if (typeof data.serverTime !== 'number') {
          throw new Error('Invalid server time response format');
        }
      } else if (endpoint.includes('orderMatch/listUserOrderHistory')) {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Invalid orders response format');
        }
      }

      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify(data)
      };

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