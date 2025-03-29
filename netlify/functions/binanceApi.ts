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
  // استخراج الأصل من رأس الطلب
  const origin = event.headers.origin || 'http://localhost:3003';
  console.log('Request origin:', origin);
  
  // تكوين رؤوس CORS للبيئة المحلية
  const headers = {
    'Access-Control-Allow-Origin': origin.includes('localhost') ? origin : 'https://evoucher.netlify.app',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin, X-MBX-APIKEY',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
  
  console.log('Request received:', event.httpMethod, event.path);

  // معالجة طلبات OPTIONS مباشرة
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    console.log('Method Not Allowed:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    if (!event.body) {
      console.log('Missing request body');
      throw new Error('Request body is required');
    }

    console.log('Request body received, parsing...');
    const { apiKey, secretKey, endpoint, params = {} } = JSON.parse(event.body) as BinanceRequestParams;

    if (!apiKey || !secretKey) {
      console.log('Missing API Key or Secret Key');
      throw new Error('API Key and Secret Key are required');
    }

    let requestUrl = `${BINANCE_API_URL}${endpoint}`;
    console.log('Request URL:', requestUrl);

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

    console.log('Request headers:', JSON.stringify(requestHeaders, null, 2));
    
    try {
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
        if (responseText.trim() === '') {
          console.log('Empty response received');
          return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ 
              error: 'Empty response from Binance API',
              endpoint: endpoint
            })
          };
        }
        
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
            rawResponse: responseText,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          })
        };
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to fetch from Binance API',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
          url: requestUrl 
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