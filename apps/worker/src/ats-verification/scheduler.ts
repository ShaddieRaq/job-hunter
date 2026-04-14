import { randomUUID } from 'node:crypto';

export type AtsVerificationRetryClass = 'none' | 'transient' | 'rate_limited';
export type AtsVerificationOutcomeStatus = 'verified' | 'failed' | 'pending' | 'stale';
export type AtsVerificationRunHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type AtsVerificationJobState =
  | 'idle'
  | 'running'
  | 'healthy'
  | 'degraded'
  | 'unhealthy';

export interface AtsVerificationCandidate {
  targetId: string;
  atsVendor: string;
  identifierValue: string;
  lastAttemptedAt: string | null;
}

export interface AtsVerificationResult {
  outcomeStatus: AtsVerificationOutcomeStatus;
  reasonCode: string;
  retryClass: AtsVerificationRetryClass;
  httpStatus: number | null;
  evidenceSummary: string;
}

export interface AtsTargetVerifier {
  verifyIdentifier(identifierValue: string): Promise<AtsVerificationResult>;
}

export type AtsTargetVerifierMap = Record<string, AtsTargetVerifier>;

export interface AtsVerificationEventWrite {
  eventId: string;
  targetId: string;
  attemptedAt: string;
  outcomeStatus: AtsVerificationOutcomeStatus;
  httpStatus: number | null;
  errorCode: string | null;
  evidenceSummary: string;
}

export interface AtsVerificationClient {
  listCandidates(options: { limit: number }): Promise<AtsVerificationCandidate[]>;
  createVerificationEvent(event: AtsVerificationEventWrite): Promise<void>;
}

export interface AtsVerificationRunSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  batchLimit: number;
  concurrencyLimit: number;
  idempotencyWindowMs: number;
  retryBudgetPerTarget: number;
  retryBackoffMs: number;
  fetchedCandidateCount: number;
  dedupedCandidateCount: number;
  processedCandidateCount: number;
  idempotencySkippedCount: number;
  missingVerifierCount: number;
  verificationAttempts: number;
  eventWriteCount: number;
  verifiedCount: number;
  failedCount: number;
  pendingCount: number;
  retryBudgetExhaustedCount: number;
  transientErrorCount: number;
  healthStatus: AtsVerificationRunHealthStatus;
  errors: string[];
}

export interface AtsVerificationJobStatus {
  jobName: 'ats_target_verification';
  state: AtsVerificationJobState;
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
  lastSummary: AtsVerificationRunSummary | null;
}

export interface CreateAtsVerificationSchedulerOptions {
  client: AtsVerificationClient;
  verifiers: AtsTargetVerifierMap;
  intervalMs: number;
  runOnStart?: boolean;
  batchLimit: number;
  concurrencyLimit: number;
  idempotencyWindowMs: number;
  retryBudgetPerTarget: number;
  retryBackoffMs: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface AtsVerificationScheduler {
  start(): void;
  stop(): void;
  triggerNow(): Promise<AtsVerificationRunSummary>;
  getStatus(): AtsVerificationJobStatus;
}

interface RunAtsVerificationCycleOptions {
  client: AtsVerificationClient;
  verifiers: AtsTargetVerifierMap;
  batchLimit: number;
  concurrencyLimit: number;
  idempotencyWindowMs: number;
  retryBudgetPerTarget: number;
  retryBackoffMs: number;
  now: () => Date;
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

const toNonNegativeInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName}_must_be_non_negative_integer`);
  }

  return value;
};

const parseIsoTimestamp = (value: string | null): Date | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    return null;
  }

  return new Date(parsedMs);
};

const isWithinIdempotencyWindow = (
  nowDate: Date,
  lastAttemptedAt: string | null,
  idempotencyWindowMs: number,
): boolean => {
  const parsedLastAttemptedAt = parseIsoTimestamp(lastAttemptedAt);
  if (!parsedLastAttemptedAt) {
    return false;
  }

  return nowDate.getTime() - parsedLastAttemptedAt.getTime() < idempotencyWindowMs;
};

const createSyntheticVerifierErrorResult = (
  error: unknown,
): AtsVerificationResult => ({
  outcomeStatus: 'pending',
  reasonCode: 'worker_verifier_exception',
  retryClass: 'transient',
  httpStatus: null,
  evidenceSummary: `worker_verifier_exception:${toErrorMessage(error)}`,
});

const cloneSummary = (
  summary: AtsVerificationRunSummary,
): AtsVerificationRunSummary => ({
  ...summary,
  errors: [...summary.errors],
});

const cloneStatus = (
  status: AtsVerificationJobStatus,
): AtsVerificationJobStatus => ({
  ...status,
  lastSummary: status.lastSummary ? cloneSummary(status.lastSummary) : null,
});

const processWithConcurrency = async <T>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const normalizedConcurrency = Math.min(concurrencyLimit, items.length);
  let cursor = 0;

  const runners = Array.from({ length: normalizedConcurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) {
        continue;
      }

      await worker(item, index);
    }
  });

  await Promise.all(runners);
};

const calculateRunHealthStatus = (
  errors: string[],
  retryBudgetExhaustedCount: number,
  transientErrorCount: number,
  missingVerifierCount: number,
): AtsVerificationRunHealthStatus => {
  if (errors.some((error) => error.startsWith('list_candidates:'))) {
    return 'unhealthy';
  }

  if (
    errors.length > 0 ||
    retryBudgetExhaustedCount > 0 ||
    transientErrorCount > 0 ||
    missingVerifierCount > 0
  ) {
    return 'degraded';
  }

  return 'healthy';
};

export const runAtsVerificationCycle = async ({
  client,
  verifiers,
  batchLimit,
  concurrencyLimit,
  idempotencyWindowMs,
  retryBudgetPerTarget,
  retryBackoffMs,
  now,
  sleep,
}: RunAtsVerificationCycleOptions): Promise<AtsVerificationRunSummary> => {
  const normalizedBatchLimit = toPositiveInteger(batchLimit, 'batch_limit');
  const normalizedConcurrencyLimit = toPositiveInteger(
    concurrencyLimit,
    'concurrency_limit',
  );
  const normalizedIdempotencyWindowMs = toPositiveInteger(
    idempotencyWindowMs,
    'idempotency_window_ms',
  );
  const normalizedRetryBudgetPerTarget = toNonNegativeInteger(
    retryBudgetPerTarget,
    'retry_budget_per_target',
  );
  const normalizedRetryBackoffMs = toPositiveInteger(
    retryBackoffMs,
    'retry_backoff_ms',
  );

  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const errors: string[] = [];

  let fetchedCandidates: AtsVerificationCandidate[] = [];
  try {
    fetchedCandidates = await client.listCandidates({
      limit: normalizedBatchLimit,
    });
  } catch (error: unknown) {
    errors.push(`list_candidates:${toErrorMessage(error)}`);

    const completedAtDate = now();
    return {
      startedAt,
      completedAt: completedAtDate.toISOString(),
      durationMs: Math.max(0, completedAtDate.getTime() - startedAtDate.getTime()),
      batchLimit: normalizedBatchLimit,
      concurrencyLimit: normalizedConcurrencyLimit,
      idempotencyWindowMs: normalizedIdempotencyWindowMs,
      retryBudgetPerTarget: normalizedRetryBudgetPerTarget,
      retryBackoffMs: normalizedRetryBackoffMs,
      fetchedCandidateCount: 0,
      dedupedCandidateCount: 0,
      processedCandidateCount: 0,
      idempotencySkippedCount: 0,
      missingVerifierCount: 0,
      verificationAttempts: 0,
      eventWriteCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      retryBudgetExhaustedCount: 0,
      transientErrorCount: 1,
      healthStatus: 'unhealthy',
      errors,
    };
  }

  const uniqueCandidates: AtsVerificationCandidate[] = [];
  const seenTargetIds = new Set<string>();

  for (const candidate of fetchedCandidates) {
    const targetId = candidate.targetId.trim();
    if (targetId.length === 0) {
      errors.push('invalid_candidate:empty_target_id');
      continue;
    }

    if (seenTargetIds.has(targetId)) {
      continue;
    }

    const identifierValue = candidate.identifierValue.trim();
    if (identifierValue.length === 0) {
      errors.push(`invalid_candidate:${targetId}:empty_identifier_value`);
      continue;
    }

    seenTargetIds.add(targetId);
    uniqueCandidates.push({
      ...candidate,
      targetId,
      identifierValue,
    });
  }

  const summary: AtsVerificationRunSummary = {
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    batchLimit: normalizedBatchLimit,
    concurrencyLimit: normalizedConcurrencyLimit,
    idempotencyWindowMs: normalizedIdempotencyWindowMs,
    retryBudgetPerTarget: normalizedRetryBudgetPerTarget,
    retryBackoffMs: normalizedRetryBackoffMs,
    fetchedCandidateCount: fetchedCandidates.length,
    dedupedCandidateCount: uniqueCandidates.length,
    processedCandidateCount: 0,
    idempotencySkippedCount: 0,
    missingVerifierCount: 0,
    verificationAttempts: 0,
    eventWriteCount: 0,
    verifiedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    retryBudgetExhaustedCount: 0,
    transientErrorCount: 0,
    healthStatus: 'healthy',
    errors,
  };

  await processWithConcurrency(
    uniqueCandidates,
    normalizedConcurrencyLimit,
    async (candidate) => {
      if (
        isWithinIdempotencyWindow(
          now(),
          candidate.lastAttemptedAt,
          normalizedIdempotencyWindowMs,
        )
      ) {
        summary.idempotencySkippedCount += 1;
        return;
      }

      const verifier = verifiers[candidate.atsVendor];
      if (!verifier) {
        summary.missingVerifierCount += 1;
        summary.errors.push(
          `missing_verifier:${candidate.targetId}:${candidate.atsVendor}`,
        );
        return;
      }

      summary.processedCandidateCount += 1;

      let remainingRetryBudget = normalizedRetryBudgetPerTarget;
      let attemptNumber = 0;

      while (true) {
        attemptNumber += 1;
        summary.verificationAttempts += 1;

        let result: AtsVerificationResult;
        try {
          result = await verifier.verifyIdentifier(candidate.identifierValue);
        } catch (error: unknown) {
          summary.transientErrorCount += 1;
          summary.errors.push(
            `verify_identifier:${candidate.targetId}:${toErrorMessage(error)}`,
          );
          result = createSyntheticVerifierErrorResult(error);
        }

        try {
          await client.createVerificationEvent({
            eventId: randomUUID(),
            targetId: candidate.targetId,
            attemptedAt: now().toISOString(),
            outcomeStatus: result.outcomeStatus,
            httpStatus: result.httpStatus,
            errorCode: result.reasonCode,
            evidenceSummary: result.evidenceSummary,
          });
          summary.eventWriteCount += 1;
        } catch (error: unknown) {
          summary.transientErrorCount += 1;
          summary.errors.push(
            `create_verification_event:${candidate.targetId}:${toErrorMessage(error)}`,
          );
          break;
        }

        if (result.outcomeStatus === 'verified') {
          summary.verifiedCount += 1;
        } else if (result.outcomeStatus === 'failed') {
          summary.failedCount += 1;
        } else {
          summary.pendingCount += 1;
        }

        const retryable =
          result.outcomeStatus === 'pending' && result.retryClass !== 'none';
        if (!retryable) {
          break;
        }

        if (remainingRetryBudget <= 0) {
          summary.retryBudgetExhaustedCount += 1;
          summary.errors.push(
            `retry_budget_exhausted:${candidate.targetId}:${result.reasonCode}`,
          );
          break;
        }

        const backoffMs = normalizedRetryBackoffMs * 2 ** (attemptNumber - 1);
        remainingRetryBudget -= 1;
        await sleep(backoffMs);
      }
    },
  );

  const completedAtDate = now();
  summary.completedAt = completedAtDate.toISOString();
  summary.durationMs = Math.max(0, completedAtDate.getTime() - startedAtDate.getTime());
  summary.healthStatus = calculateRunHealthStatus(
    summary.errors,
    summary.retryBudgetExhaustedCount,
    summary.transientErrorCount,
    summary.missingVerifierCount,
  );

  return summary;
};

export const createAtsVerificationScheduler = ({
  client,
  verifiers,
  intervalMs,
  runOnStart = false,
  batchLimit,
  concurrencyLimit,
  idempotencyWindowMs,
  retryBudgetPerTarget,
  retryBackoffMs,
  now = () => new Date(),
  sleep = defaultSleep,
  logger = console,
}: CreateAtsVerificationSchedulerOptions): AtsVerificationScheduler => {
  const normalizedIntervalMs = toPositiveInteger(intervalMs, 'interval_ms');

  const status: AtsVerificationJobStatus = {
    jobName: 'ats_target_verification',
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
  let activeRun: Promise<AtsVerificationRunSummary> | null = null;

  const updateNextScheduledAt = (): void => {
    if (!timer) {
      status.nextScheduledAt = null;
      return;
    }

    status.nextScheduledAt = new Date(
      now().getTime() + normalizedIntervalMs,
    ).toISOString();
  };

  const executeRun = async (): Promise<AtsVerificationRunSummary> => {
    status.state = 'running';
    status.lastError = null;
    status.lastStartedAt = now().toISOString();

    const summary = await runAtsVerificationCycle({
      client,
      verifiers,
      batchLimit,
      concurrencyLimit,
      idempotencyWindowMs,
      retryBudgetPerTarget,
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
      status.lastError = summary.errors[0] ?? 'ats_verification_cycle_failed';
    }

    logger.info(
      `[worker] ats verification cycle ${summary.healthStatus} (processed=${summary.processedCandidateCount}, attempts=${summary.verificationAttempts}, retryBudgetExhausted=${summary.retryBudgetExhaustedCount})`,
    );

    updateNextScheduledAt();
    return summary;
  };

  const triggerNow = async (): Promise<AtsVerificationRunSummary> => {
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
        `[worker] ats verification scheduler started (intervalMs=${normalizedIntervalMs}, runOnStart=${runOnStart})`,
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
      logger.info('[worker] ats verification scheduler stopped');
    },

    triggerNow,

    getStatus(): AtsVerificationJobStatus {
      return cloneStatus(status);
    },
  };
};

export const createNoopAtsVerificationClient = (): AtsVerificationClient => ({
  async listCandidates() {
    return [];
  },
  async createVerificationEvent() {
    return undefined;
  },
});