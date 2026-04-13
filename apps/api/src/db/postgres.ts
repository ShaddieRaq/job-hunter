import { Pool } from 'pg';

const parseIntegerEnv = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

let sharedPool: Pool | null = null;

export const getSharedPostgresPool = (): Pool | null => {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return null;
  }

  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString,
      max: parseIntegerEnv(process.env.PG_POOL_MAX, 10),
      idleTimeoutMillis: parseIntegerEnv(process.env.PG_IDLE_TIMEOUT_MS, 30_000),
    });

    sharedPool.on('error', (error: Error) => {
      console.error('postgres_pool_error', error.message);
    });
  }

  return sharedPool;
};

export type PostgresPool = Pool;
