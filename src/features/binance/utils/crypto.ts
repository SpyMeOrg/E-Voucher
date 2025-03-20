import crypto from 'crypto';

export function generateSignature(queryString: string, secretKey: string): string {
    return crypto
        .createHmac('sha256', secretKey)
        .update(queryString)
        .digest('hex');
}

export function buildQueryString(params: Record<string, any>): string {
    return Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
}
