import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import crypto from 'crypto';
import https from 'https';

// تحديث عنوان API بناءً على نوع الطلب
const BINANCE_API_URL = 'https://api.binance.com';
const BINANCE_DATA_API_URL = 'https://data.binance.com';

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

// تحديد ما إذا كان الطلب للقراءة فقط
const isReadOnlyEndpoint = (endpoint: string): boolean => {
  const readOnlyEndpoints = [
    '/api/v3/time',
    '/api/v3/ticker',
    '/api/v3/ticker/24hr',
    '/api/v3/ticker/price',
    '/api/v3/ticker/bookTicker',
    '/api/v3/exchangeInfo',
    '/api/v3/depth',
    '/api/v3/trades',
    '/api/v3/historicalTrades',
    '/api/v3/aggTrades',
    '/api/v3/klines',
    '/api/v3/avgPrice',
    '/api/v3/ping'
  ];
  return readOnlyEndpoints.some(e => endpoint.startsWith(e));
};

export const handler: Handler = async (event) => {
  // تكوين رؤوس CORS بناءً على البيئة
  const origin = event.headers.origin || '';
  const allowedOrigins = [
    'http://localhost:3002',
    'http://localhost:3000',
    'https://evoucher.netlify.app'
  ];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin, X-MBX-APIKEY',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  // معالجة طلبات OPTIONS مباشرة
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
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

    // اختيار النطاق المناسب بناءً على نوع الطلب
    const baseUrl = isReadOnlyEndpoint(endpoint) ? BINANCE_DATA_API_URL : BINANCE_API_URL;
    let requestUrl = `${baseUrl}${endpoint}`;
    console.log('Request URL:', requestUrl);

    if (endpoint === '/api/v3/time') {
      requestUrl = `${baseUrl}/api/v3/time`;
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

    if (!isReadOnlyEndpoint(endpoint)) {
      requestHeaders['X-MBX-APIKEY'] = apiKey;
    }

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: requestHeaders,
      agent,
      timeout: 30000
    });

    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Raw response:', responseText);

    try {
      const data = JSON.parse(responseText);
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    };
  }
}; 