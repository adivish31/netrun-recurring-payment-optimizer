import type { PoolConfig } from 'pg';

export const DEFAULT_DATABASE_URL = 'postgres://netrun:netrun@localhost:5432/netrun';

/**
 * Pool config shared by the API server and the migration script.
 *
 * SSL resolution, first match wins:
 *   1. DATABASE_SSL=true|false            explicit override
 *   2. sslmode=disable / sslmode=require  in the URL
 *   3. hostname with a dot (e.g. *.neon.tech, *.render.com) -> SSL on;
 *      localhost, docker service names and Render internal hosts -> SSL off
 */
export function poolConfig(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL): PoolConfig {
  return { connectionString, ssl: useSsl(connectionString) ? { rejectUnauthorized: false } : false };
}

function useSsl(connectionString: string): boolean {
  const override = process.env.DATABASE_SSL?.toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;

  if (/sslmode=disable/.test(connectionString)) return false;
  if (/sslmode=(require|verify-ca|verify-full)/.test(connectionString)) return true;

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return false;
  }
  return host.includes('.') && host !== '127.0.0.1';
}

export function maskUrl(connectionString: string): string {
  return connectionString.replace(/:[^:@/]*@/, ':****@');
}
