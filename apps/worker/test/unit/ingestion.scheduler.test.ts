import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalRebuildResponseSchema,
  connectorContractVersion,
  jobsContractVersion,
  type CanonicalRebuildResponse,
  type ConnectorSyncResponse,
  type SourceName,
} from '@job-hunter/shared';

import type { IngestionApiClient } from '../../src/ingestion/client.js';
import {
  createIngestionScheduler,
  runIngestionCycle,
  withRetry,
} from '../../src/ingestion/scheduler.js';

const buildSyncResponse = (
  sourceName: SourceName,
  overrides: Partial<ConnectorSyncResponse> = {},
): ConnectorSyncResponse => ({
  contractVersion: connectorContractVersion,
  sourceName,
  startedAt: '2026-04-13T10:00:00.000Z',
  completedAt: '2026-04-13T10:00:05.000Z',
  fetchedCount: 12,
  insertedCount: 8,
  updatedCount: 2,
  unchangedCount: 2,
  failedCount: 0,
  healthStatus: 'healthy',
  errors: [],
  ...overrides,
});

const buildRebuildResponse = (
  overrides: Partial<CanonicalRebuildResponse> = {},
): CanonicalRebuildResponse => {
  const candidate = {
    contractVersion: jobsContractVersion,
    startedAt: '2026-04-13T10:01:00.000Z',
    completedAt: '2026-04-13T10:01:05.000Z',
    sourceJobsScanned: 12,
    canonicalJobsCreated: 10,
    canonicalJobsUpdated: 2,
    dedupedSourceJobs: 4,
    ...overrides,
  };

  const parsed = canonicalRebuildResponseSchema.parse(candidate);
  return parsed;
};

test('runIngestionCycle reports healthy when sync and rebuild both succeed', async () => {
  const client: IngestionApiClient = {
    async listConnectorNames() {
      return ['greenhouse_public_board'];
    },
    async syncConnector() {
      return buildSyncResponse('greenhouse_public_board');
    },
    async rebuildCanonicalCatalog() {
      return buildRebuildResponse();
    },
  };

  const summary = await runIngestionCycle({
    client,
    maxRecordsPerSync: 200,
    maxSourceJobsForRebuild: 500,
    retryMaxAttempts: 1,
    retryBackoffMs: 1,
    now: () => new Date('2026-04-13T10:02:00.000Z'),
    sleep: async () => undefined,
  });

  assert.equal(summary.healthStatus, 'healthy');
  assert.equal(summary.connectorNames.length, 1);
  assert.equal(summary.syncResults.length, 1);
  assert.equal(summary.connectorFailures.length, 0);
  assert.equal(summary.rebuildResult?.sourceJobsScanned, 12);
  assert.equal(summary.errors.length, 0);
});

test('runIngestionCycle marks degraded when at least one connector fails', async () => {
  const calls: string[] = [];

  const client: IngestionApiClient = {
    async listConnectorNames() {
      return ['greenhouse_public_board', 'ashby_public_board'];
    },
    async syncConnector(sourceName) {
      calls.push(`sync:${sourceName}`);
      if (sourceName === 'ashby_public_board') {
        throw new Error('connector_downstream_timeout');
      }

      return buildSyncResponse('greenhouse_public_board');
    },
    async rebuildCanonicalCatalog() {
      calls.push('rebuild');
      return buildRebuildResponse();
    },
  };

  const summary = await runIngestionCycle({
    client,
    maxRecordsPerSync: 200,
    maxSourceJobsForRebuild: 500,
    retryMaxAttempts: 1,
    retryBackoffMs: 1,
    now: () => new Date('2026-04-13T10:05:00.000Z'),
    sleep: async () => undefined,
  });

  assert.equal(summary.healthStatus, 'degraded');
  assert.equal(summary.syncResults.length, 1);
  assert.equal(summary.connectorFailures.length, 1);
  assert.match(summary.connectorFailures[0]?.error ?? '', /connector_downstream_timeout/);
  assert.equal(calls.includes('rebuild'), true);
});

test('withRetry retries failed operations with exponential backoff', async () => {
  let attempts = 0;
  const backoffCalls: number[] = [];

  const result = await withRetry(
    'retry_operation',
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('temporary_failure');
      }

      return 'ok';
    },
    {
      maxAttempts: 3,
      baseBackoffMs: 100,
      sleep: async (ms: number) => {
        backoffCalls.push(ms);
      },
    },
  );

  assert.equal(result.value, 'ok');
  assert.equal(result.attempts, 3);
  assert.deepEqual(backoffCalls, [100, 200]);
});

test('ingestion scheduler tracks status after manual trigger', async () => {
  const client: IngestionApiClient = {
    async listConnectorNames() {
      return ['greenhouse_public_board'];
    },
    async syncConnector() {
      return buildSyncResponse('greenhouse_public_board');
    },
    async rebuildCanonicalCatalog() {
      return buildRebuildResponse();
    },
  };

  const scheduler = createIngestionScheduler({
    client,
    intervalMs: 60_000,
    runOnStart: false,
    maxRecordsPerSync: 200,
    maxSourceJobsForRebuild: 500,
    retryMaxAttempts: 1,
    retryBackoffMs: 1,
    now: () => new Date('2026-04-13T10:08:00.000Z'),
    sleep: async () => undefined,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  const before = scheduler.getStatus();
  assert.equal(before.state, 'idle');
  assert.equal(before.runCount, 0);

  const summary = await scheduler.triggerNow();
  assert.equal(summary.healthStatus, 'healthy');

  const after = scheduler.getStatus();
  assert.equal(after.state, 'healthy');
  assert.equal(after.runCount, 1);
  assert.equal(after.successCount, 1);
  assert.equal(after.failureCount, 0);

  scheduler.stop();
});
