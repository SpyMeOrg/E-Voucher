import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import crypto from 'crypto';

const BINANCE_API_URL = 'https://api.binance.com';

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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' })
      };
    }

    console.log('Received request body:', event.body);
    
    const { apiKey, secretKey, endpoint, params = {} } = JSON.parse(event.body) as BinanceRequestParams;

    if (!apiKey || !secretKey) {
      console.error('Missing API Key or Secret Key');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'API Key and Secret Key are required' })
      };
    }

    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
      ...params
    });

    // إضافة timestamp و recvWindow فقط إذا لم تكن نقطة النهاية هي /api/v3/time
    if (!endpoint.includes('/api/v3/time')) {
      queryParams.append('timestamp', timestamp.toString());
      queryParams.append('recvWindow', '60000');
      const signature = createSignature(queryParams.toString(), secretKey);
      queryParams.append('signature', signature);
    }

    const requestUrl = `${BINANCE_API_URL}${endpoint}?${queryParams.toString()}`;
    console.log('Requesting URL:', requestUrl);

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid response from Binance',
          details: responseText
        })
      };
    }

    console.log('Parsed Binance API Response:', data);

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Error in binanceApi function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}; 