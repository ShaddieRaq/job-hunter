import type {
  CanonicalRebuildResponse,
  ConnectorSyncResponse,
  SourceName,
} from '@job-hunter/shared';

import type { IngestionApiClient } from './client.js';

export type IngestionRunHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type IngestionJobState =
  | 'idle'
  | 'running'
  | 'healthy'
  | 'degraded'
  | 'unhealthy';

export interface IngestionConnectorRunResult {
  sourceName: SourceName;
  attempts: number;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  healthStatus: ConnectorSyncResponse['healthStatus'];
}

export interface IngestionConnectorFailure {
  sourceName: SourceName;
  attempts: number;
  error: string;
}

export interface IngestionRunSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  listConnectorsAttempts: number;
  connectorNames: SourceName[];
  syncResults: IngestionConnectorRunResult[];
  connectorFailures: IngestionConnectorFailure[];
  rebuildAttempts: number | null;
  rebuildResult: CanonicalRebuildResponse | null;
  rebuildFailure: string | null;
  healthStatus: IngestionRunHealthStatus;
  errors: string[];
}

export interface IngestionJobStatus {
  jobName: 'connector_sync_and_canonical_rebuild';
  state: IngestionJobState;
  intervalMs: number;
  runOnStart: boolean;
  runCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  nextScheduledAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastSummary: IngestionRunSummary | null;
}

export interface CreateIngestionSchedulerOptions {
  client: IngestionApiClient;
  intervalMs: number;
  runOnStart?: boolean;
  maxRecordsPerSync: number;
  maxSourceJobsForRebuild: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface IngestionScheduler {
  start(): void;
  stop(): void;
  triggerNow(): Promise<IngestionRunSummary>;
  getStatus(): IngestionJobStatus;
}

export interface RetryOptions {
  maxAttempts: number;
  baseBackoffMs: number;
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown_error';
};

const toPositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName}_must_be_positive_integer`);
  }

  return value;
};

const calculateHealthStatus = (
  connectorNames: SourceName[],
  syncResults: IngestionConnectorRunResult[],
  connectorFailures: IngestionConnectorFailure[],
  rebuildFailure: string | null,
): IngestionRunHealthStatus => {
  const hasDegradedSync = syncResults.some(
    (result) => result.failedCount > 0 || result.healthStatus !== 'healthy',
  );

  if (connectorNames.length === 0) {
    return 'unhealthy';
  }

  if (syncResults.length === 0 && connectorFailures.length > 0) {
    return 'unhealthy';
  }

  if (rebuildFailure && syncResults.length === 0) {
    return 'unhealthy';
  }

  if (connectorFailures.length > 0 || hasDegradedSync || rebuildFailure) {
    return 'degraded';
  }

  return 'healthy';
};

const cloneSummary = (summary: IngestionRunSummary): IngestionRunSummary => ({
  ...summary,
  connectorNames: [...summary.connectorNames],
  syncResults: summary.syncResults.map((result) => ({ ...result })),
  connectorFailures: summary.connectorFailures.map((failure) => ({ ...failure })),
  rebuildResult: summary.rebuildResult ? { ...summary.rebuildResult } : null,
  errors: [...summary.errors],
});

const cloneStatus = (status: IngestionJobStatus): IngestionJobStatus => ({
  ...status,
  lastSummary: status.lastSummary ? cloneSummary(status.lastSummary) : null,
});

export const withRetry = async <T>(
  label: string,
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<{ value: T; attempts: number }> => {
  const maxAttempts = toPositiveInteger(options.maxAttempts, 'retry_max_attempts');
  const baseBackoffMs = toPositiveInteger(
    options.baseBackoffMs,
    'retry_base_backoff_ms',
  );

  let attempts = 0;
  let lastError: unknown = null;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const value = await operation();
      return {
        value,
        attempts,
      };
    } catch (error: unknown) {
      lastError = error;
      if (attempts >= maxAttempts) {
        break;
      }

      const backoffMs = baseBackoffMs * 2 ** (attempts - 1);
      await options.sleep(backoffMs);
    }
  }

  throw new Error(
    `${label} failed after ${attempts} attempts: ${toErrorMessage(lastError)}`,
  );
};

interface RunIngestionCycleOptions {
  client: IngestionApiClient;
  maxRecordsPerSync: number;
  maxSourceJobsForRebuild: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export const runIngestionCycle = async ({
  client,
  maxRecordsPerSync,
  maxSourceJobsForRebuild,
  retryMaxAttempts,
  retryBackoffMs,
  now,
  sleep,
}: RunIngestionCycleOptions): Promise<IngestionRunSummary> => {
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();

  let listConnectorsAttempts = 0;
  let rebuildAttempts: number | null = null;
  let rebuildResult: CanonicalRebuildResponse | null = null;
  let rebuildFailure: string | null = null;

  const connectorNames: SourceName[] = [];
  const syncResults: IngestionConnectorRunResult[] = [];
  const connectorFailures: IngestionConnectorFailure[] = [];
  const errors: string[] = [];

  try {
    const listed = await withRetry(
      'list_connectors',
      async () => client.listConnectorNames(),
      {
        maxAttempts: retryMaxAttempts,
        baseBackoffMs: retryBackoffMs,
        sleep,
      },
    );

    listConnectorsAttempts = listed.attempts;
    connectorNames.push(...listed.value);
  } catch (error: unknown) {
    listConnectorsAttempts = retryMaxAttempts;
    errors.push(toErrorMessage(error));

    const completedAtDate = now();
    return {
      startedAt,
      completedAt: completedAtDate.toISOString(),
      durationMs: Math.max(0, completedAtDate.getTime() - startedAtDate.getTime()),
      listConnectorsAttempts,
      connectorNames,
      syncResults,
      connectorFailures,
      rebuildAttempts,
      rebuildResult,
      rebuildFailure,
      healthStatus: 'unhealthy',
      errors,
    };
  }

  for (const sourceName of connectorNames) {
    try {
      const synced = await withRetry(
        `sync_connector:${sourceName}`,
        async () => client.syncConnector(sourceName, maxRecordsPerSync),
        {
          maxAttempts: retryMaxAttempts,
          baseBackoffMs: retryBackoffMs,
          sleep,
        },
      );

      syncResults.push({
        sourceName,
        attempts: synced.attempts,
        fetchedCount: synced.value.fetchedCount,
        insertedCount: synced.value.insertedCount,
        updatedCount: synced.value.updatedCount,
        unchangedCount: synced.value.unchangedCount,
        failedCount: synced.value.failedCount,
        healthStatus: synced.value.healthStatus,
      });
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error);
      connectorFailures.push({
        sourceName,
        attempts: retryMaxAttempts,
        error: errorMessage,
      });
      errors.push(`sync_connector:${sourceName}:${errorMessage}`);
    }
  }

  if (connectorNames.length > 0) {
    try {
      const rebuilt = await withRetry(
        'rebuild_canonical_catalog',
        async () => client.rebuildCanonicalCatalog(maxSourceJobsForRebuild),
        {
          maxAttempts: retryMaxAttempts,
          baseBackoffMs: retryBackoffMs,
          sleep,
        },
      );

      rebuildAttempts = rebuilt.attempts;
      rebuildResult = rebuilt.value;
    } catch (error: unknown) {
      rebuildAttempts = retryMaxAttempts;
      rebuildFailure = toErrorMessage(error);
      errors.push(`rebuild_canonical_catalog:${rebuildFailure}`);
    }
  }

  const completedAtDate = now();
  const healthStatus = calculateHealthStatus(
    connectorNames,
    syncResults,
    connectorFailures,
    rebuildFailure,
  );

  return {
    startedAt,
    completedAt: completedAtDate.toISOString(),
    durationMs: Math.max(0, completedAtDate.getTime() - startedAtDate.getTime()),
    listConnectorsAttempts,
    connectorNames,
    syncResults,
    connectorFailures,
    rebuildAttempts,
    rebuildResult,
    rebuildFailure,
    healthStatus,
    errors,
  };
};

export const createIngestionScheduler = ({
  client,
  intervalMs,
  runOnStart = true,
  maxRecordsPerSync,
  maxSourceJobsForRebuild,
  retryMaxAttempts,
  retryBackoffMs,
  now = () => new Date(),
  sleep = defaultSleep,
  logger = console,
}: CreateIngestionSchedulerOptions): IngestionScheduler => {
  const normalizedIntervalMs = toPositiveInteger(intervalMs, 'interval_ms');

  const status: IngestionJobStatus = {
    jobName: 'connector_sync_and_canonical_rebuild',
    state: 'idle',
    intervalMs: normalizedIntervalMs,
    runOnStart,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    nextScheduledAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
  };

  let timer: NodeJS.Timeout | null = null;
  let activeRun: Promise<IngestionRunSummary> | null = null;

  const updateNextScheduledAt = (): void => {
    if (!timer) {
      status.nextScheduledAt = null;
      return;
    }

    status.nextScheduledAt = new Date(
      now().getTime() + normalizedIntervalMs,
    ).toISOString();
  };

  const executeRun = async (): Promise<IngestionRunSummary> => {
    status.state = 'running';
    status.lastError = null;
    status.lastStartedAt = now().toISOString();

    const summary = await runIngestionCycle({
      client,
      maxRecordsPerSync,
      maxSourceJobsForRebuild,
      retryMaxAttempts,
      retryBackoffMs,
      now,
      sleep,
    });

    status.lastSummary = summary;
    status.lastDurationMs = summary.durationMs;
    status.lastCompletedAt = summary.completedAt;
    status.runCount += 1;

    if (summary.healthStatus === 'healthy') {
      status.state = 'healthy';
      status.successCount += 1;
      status.consecutiveFailures = 0;
      status.lastError = null;
    } else {
      status.state = summary.healthStatus;
      status.failureCount += 1;
      status.consecutiveFailures += 1;
      status.lastError = summary.errors[0] ?? summary.rebuildFailure ?? 'ingestion_cycle_failed';
    }

    logger.info(
      `[worker] ingestion cycle ${summary.healthStatus} (sync=${summary.syncResults.length}, failures=${summary.connectorFailures.length})`,
    );

    updateNextScheduledAt();
    return summary;
  };

  const triggerNow = async (): Promise<IngestionRunSummary> => {
    if (activeRun) {
      return activeRun;
    }

    activeRun = executeRun().finally(() => {
      activeRun = null;
    });

    return activeRun;
  };

  return {
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void triggerNow();
      }, normalizedIntervalMs);

      timer.unref?.();
      updateNextScheduledAt();

      logger.info(
        `[worker] ingestion scheduler started (intervalMs=${normalizedIntervalMs}, runOnStart=${runOnStart})`,
      );

      if (runOnStart) {
        void triggerNow();
      }
    },

    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = null;
      updateNextScheduledAt();
      logger.info('[worker] ingestion scheduler stopped');
    },

    triggerNow,

    getStatus(): IngestionJobStatus {
      return cloneStatus(status);
    },
  };
};
