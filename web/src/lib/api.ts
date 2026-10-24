const rawApiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export const API_BASE =
  rawApiBase.startsWith('http://') || rawApiBase.startsWith('https://')
    ? rawApiBase
    : `https://${rawApiBase}`;
