import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createIngestionApiClient } from './ingestion/client.js';
import { createIngestionScheduler } from './ingestion/scheduler.js';

const parsePositiveIntegerEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

const parseBooleanEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`${name} must be either true or false`);
};

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  const serialized = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(serialized));
  res.end(serialized);
};

const getPathname = (req: IncomingMessage): string =>
  new URL(req.url ?? '/', 'http://localhost').pathname;

const workerPort = parsePositiveIntegerEnv('WORKER_PORT', 3002);
const workerApiBaseUrl = process.env.WORKER_API_BASE_URL ?? 'http://localhost:3001';
const workerServiceEmail =
  process.env.WORKER_SERVICE_EMAIL ?? 'worker.ingestion@job-hunter.local';
const ingestionIntervalMs = parsePositiveIntegerEnv(
  'WORKER_INGESTION_INTERVAL_MS',
  5 * 60 * 1000,
);
const runOnStart = parseBooleanEnv('WORKER_INGESTION_RUN_ON_START', true);
const syncMaxRecords = parsePositiveIntegerEnv('WORKER_SYNC_MAX_RECORDS', 200);
const rebuildMaxSourceJobs = parsePositiveIntegerEnv(
  'WORKER_REBUILD_MAX_SOURCE_JOBS',
  500,
);
const retryMaxAttempts = parsePositiveIntegerEnv('WORKER_RETRY_MAX_ATTEMPTS', 3);
const retryBackoffMs = parsePositiveIntegerEnv('WORKER_RETRY_BACKOFF_MS', 1000);

const ingestionApiClient = createIngestionApiClient({
  apiBaseUrl: workerApiBaseUrl,
  workerEmail: workerServiceEmail,
});

const ingestionScheduler = createIngestionScheduler({
  client: ingestionApiClient,
  intervalMs: ingestionIntervalMs,
  runOnStart,
  maxRecordsPerSync: syncMaxRecords,
  maxSourceJobsForRebuild: rebuildMaxSourceJobs,
  retryMaxAttempts,
  retryBackoffMs,
});

ingestionScheduler.start();

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  const pathname = getPathname(req);

  if (method === 'GET' && pathname === '/health') {
    const status = ingestionScheduler.getStatus();
    const isHealthy = status.state !== 'unhealthy';

    sendJson(res, isHealthy ? 200 : 503, {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'worker',
      ingestion: status,
    });
    return;
  }

  if (method === 'GET' && pathname === '/v1/worker/jobs/ingestion/status') {
    sendJson(res, 200, {
      job: ingestionScheduler.getStatus(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/v1/worker/jobs/ingestion/run') {
    void ingestionScheduler
      .triggerNow()
      .then((summary) => {
        sendJson(res, 200, {
          summary,
        });
      })
      .catch((error: unknown) => {
        sendJson(res, 500, {
          error: 'ingestion_run_failed',
          details: error instanceof Error ? error.message : 'unknown_error',
        });
      });
    return;
  }

  sendJson(res, 404, {
    error: 'not_found',
  });
});

server.listen(workerPort, () => {
  console.log(`Worker listening on http://localhost:${workerPort}`);
  console.log(
    `Worker ingestion schedule: interval=${ingestionIntervalMs}ms runOnStart=${runOnStart} api=${workerApiBaseUrl}`,
  );
});

const shutdown = (signal: NodeJS.Signals): void => {
  console.log(`Worker shutdown signal received: ${signal}`);
  ingestionScheduler.stop();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
