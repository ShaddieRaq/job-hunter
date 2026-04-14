import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAtsVerificationScheduler,
  runAtsVerificationCycle,
  type AtsTargetVerifierMap,
  type AtsVerificationClient,
  type AtsVerificationResult,
} from '../../src/ats-verification/scheduler.js';

const buildResult = (
  overrides: Partial<AtsVerificationResult> = {},
): AtsVerificationResult => ({
  outcomeStatus: 'verified',
  reasonCode: 'verified_default',
  retryClass: 'none',
  httpStatus: 200,
  evidenceSummary: 'ok',
  ...overrides,
});

test('runAtsVerificationCycle reports healthy and skips duplicates/idempotent targets', async () => {
  const events: Array<{ targetId: string; outcomeStatus: string }> = [];

  const client: AtsVerificationClient = {
    async listCandidates() {
      return [
        {
          targetId: 'target-1',
          atsVendor: 'greenhouse',
          identifierValue: 'acme',
          lastAttemptedAt: null,
        },
        {
          targetId: 'target-1',
          atsVendor: 'greenhouse',
          identifierValue: 'acme-duplicate',
          lastAttemptedAt: null,
        },
        {
          targetId: 'target-2',
          atsVendor: 'greenhouse',
          identifierValue: 'recently-checked',
          lastAttemptedAt: '2026-04-14T11:30:00.000Z',
        },
      ];
    },
    async createVerificationEvent(event) {
      events.push({
        targetId: event.targetId,
        outcomeStatus: event.outcomeStatus,
      });
    },
  };

  const verifiers: AtsTargetVerifierMap = {
    greenhouse: {
      async verifyIdentifier() {
        return buildResult({
          reasonCode: 'greenhouse_public_board_verified',
        });
      },
    },
  };

  const summary = await runAtsVerificationCycle({
    client,
    verifiers,
    batchLimit: 10,
    concurrencyLimit: 2,
    idempotencyWindowMs: 60 * 60 * 1000,
    retryBudgetPerTarget: 1,
    retryBackoffMs: 25,
    now: () => new Date('2026-04-14T12:00:00.000Z'),
    sleep: async () => undefined,
  });

  assert.equal(summary.healthStatus, 'healthy');
  assert.equal(summary.fetchedCandidateCount, 3);
  assert.equal(summary.dedupedCandidateCount, 2);
  assert.equal(summary.processedCandidateCount, 1);
  assert.equal(summary.idempotencySkippedCount, 1);
  assert.equal(summary.verificationAttempts, 1);
  assert.equal(summary.eventWriteCount, 1);
  assert.equal(summary.verifiedCount, 1);
  assert.equal(summary.errors.length, 0);
  assert.deepEqual(events.map((event) => event.targetId), ['target-1']);
});

test('runAtsVerificationCycle reports degraded when candidate vendor has no verifier', async () => {
  const client: AtsVerificationClient = {
    async listCandidates() {
      return [
        {
          targetId: 'target-no-verifier',
          atsVendor: 'workable',
          identifierValue: 'acme-workable',
          lastAttemptedAt: null,
        },
      ];
    },
    async createVerificationEvent() {
      throw new Error('should_not_write_event_without_verifier');
    },
  };

  const summary = await runAtsVerificationCycle({
    client,
    verifiers: {},
    batchLimit: 10,
    concurrencyLimit: 1,
    idempotencyWindowMs: 60 * 60 * 1000,
    retryBudgetPerTarget: 1,
    retryBackoffMs: 25,
    now: () => new Date('2026-04-14T12:10:00.000Z'),
    sleep: async () => undefined,
  });

  assert.equal(summary.healthStatus, 'degraded');
  assert.equal(summary.processedCandidateCount, 0);
  assert.equal(summary.missingVerifierCount, 1);
  assert.equal(summary.eventWriteCount, 0);
  assert.ok(
    summary.errors.some((error) =>
      error.includes('missing_verifier:target-no-verifier:workable'),
    ),
  );
});

test('runAtsVerificationCycle enforces per-target retry budget for transient pending results', async () => {
  const sleepCalls: number[] = [];
  const events: Array<{ targetId: string; reasonCode: string | null }> = [];

  const client: AtsVerificationClient = {
    async listCandidates() {
      return [
        {
          targetId: 'target-retry',
          atsVendor: 'greenhouse',
          identifierValue: 'flaky-board',
          lastAttemptedAt: null,
        },
      ];
    },
    async createVerificationEvent(event) {
      events.push({
        targetId: event.targetId,
        reasonCode: event.errorCode,
      });
    },
  };

  const verifiers: AtsTargetVerifierMap = {
    greenhouse: {
      async verifyIdentifier() {
        return buildResult({
          outcomeStatus: 'pending',
          reasonCode: 'greenhouse_upstream_transient_error',
          retryClass: 'transient',
          httpStatus: 503,
          evidenceSummary: 'greenhouse_probe_status_503',
        });
      },
    },
  };

  const summary = await runAtsVerificationCycle({
    client,
    verifiers,
    batchLimit: 10,
    concurrencyLimit: 1,
    idempotencyWindowMs: 60 * 60 * 1000,
    retryBudgetPerTarget: 1,
    retryBackoffMs: 25,
    now: () => new Date('2026-04-14T12:20:00.000Z'),
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
  });

  assert.equal(summary.healthStatus, 'degraded');
  assert.equal(summary.processedCandidateCount, 1);
  assert.equal(summary.verificationAttempts, 2);
  assert.equal(summary.eventWriteCount, 2);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.retryBudgetExhaustedCount, 1);
  assert.deepEqual(sleepCalls, [25]);
  assert.equal(events.length, 2);
  assert.ok(
    summary.errors.some((error) =>
      error.includes('retry_budget_exhausted:target-retry:greenhouse_upstream_transient_error'),
    ),
  );
});

test('runAtsVerificationCycle enforces configured concurrency cap', async () => {
  let active = 0;
  let maxActive = 0;

  const client: AtsVerificationClient = {
    async listCandidates() {
      return [
        {
          targetId: 'target-1',
          atsVendor: 'greenhouse',
          identifierValue: 'one',
          lastAttemptedAt: null,
        },
        {
          targetId: 'target-2',
          atsVendor: 'greenhouse',
          identifierValue: 'two',
          lastAttemptedAt: null,
        },
        {
          targetId: 'target-3',
          atsVendor: 'greenhouse',
          identifierValue: 'three',
          lastAttemptedAt: null,
        },
        {
          targetId: 'target-4',
          atsVendor: 'greenhouse',
          identifierValue: 'four',
          lastAttemptedAt: null,
        },
      ];
    },
    async createVerificationEvent() {
      return undefined;
    },
  };

  const verifiers: AtsTargetVerifierMap = {
    greenhouse: {
      async verifyIdentifier(identifierValue) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;

        return buildResult({
          reasonCode: `verified:${identifierValue}`,
        });
      },
    },
  };

  const summary = await runAtsVerificationCycle({
    client,
    verifiers,
    batchLimit: 10,
    concurrencyLimit: 2,
    idempotencyWindowMs: 60 * 60 * 1000,
    retryBudgetPerTarget: 0,
    retryBackoffMs: 25,
    now: () => new Date('2026-04-14T12:30:00.000Z'),
    sleep: async () => undefined,
  });

  assert.equal(summary.healthStatus, 'healthy');
  assert.equal(summary.processedCandidateCount, 4);
  assert.equal(summary.verificationAttempts, 4);
  assert.ok(maxActive <= 2);
});

test('ats verification scheduler tracks status after manual trigger', async () => {
  const client: AtsVerificationClient = {
    async listCandidates() {
      return [
        {
          targetId: 'target-scheduler',
          atsVendor: 'greenhouse',
          identifierValue: 'acme',
          lastAttemptedAt: null,
        },
      ];
    },
    async createVerificationEvent() {
      return undefined;
    },
  };

  const verifiers: AtsTargetVerifierMap = {
    greenhouse: {
      async verifyIdentifier() {
        return buildResult({
          reasonCode: 'greenhouse_public_board_verified',
        });
      },
    },
  };

  const scheduler = createAtsVerificationScheduler({
    client,
    verifiers,
    intervalMs: 60_000,
    runOnStart: false,
    batchLimit: 100,
    concurrencyLimit: 2,
    idempotencyWindowMs: 60 * 60 * 1000,
    retryBudgetPerTarget: 1,
    retryBackoffMs: 25,
    now: () => new Date('2026-04-14T12:40:00.000Z'),
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