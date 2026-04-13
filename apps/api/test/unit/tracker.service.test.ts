import assert from 'node:assert/strict';
import test from 'node:test';

import type { CanonicalJobDetail, CanonicalJobId } from '@job-hunter/shared';

import { HttpError } from '../../src/http/http-errors.js';
import { createTrackerService } from '../../src/modules/tracker/service.js';

const nowIso = '2026-04-12T16:00:00.000Z';

const createCanonicalJob = (canonicalJobId: CanonicalJobId): CanonicalJobDetail => ({
  job: {
    canonicalJobId,
    canonicalCompanyName: 'Acme Labs',
    canonicalTitle: 'Senior Backend Engineer',
    normalizedLocation: 'Remote - United States',
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: 170000,
    salaryMax: 210000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 1,
    sourceNames: ['greenhouse_public_board'],
    jobStatus: 'open',
    topSkills: ['TypeScript', 'Node.js'],
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  sourceMappings: [
    {
      sourceName: 'greenhouse_public_board',
      sourceJobId: '1001',
      isPrimary: true,
      mappingConfidence: 1,
      mappingReasonCodes: ['exact_company_title'],
    },
  ],
});

test('transitionTrackedJobState creates initial tracker state and audit event', async () => {
  const canonicalJobId = '8dc5a6f6-3140-433e-bfc0-c3df97f0227f';
  const service = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: () => new Date(nowIso),
  });

  const result = await service.transitionTrackedJobState('user-1', {
    canonicalJobId,
    targetState: 'discovered',
    note: 'Saw this in today\'s feed.',
  });

  assert.equal(result.tracker.state, 'discovered');
  assert.equal(result.tracker.lastTransitionNote, "Saw this in today's feed.");
  assert.ok(result.event);
  assert.equal(result.event?.fromState, null);
  assert.equal(result.event?.toState, 'discovered');

  const history = await service.listTransitionEvents({
    userId: 'user-1',
    canonicalJobId,
  });

  assert.equal(history.length, 1);
  assert.equal(history[0]?.toState, 'discovered');
});

test('transitionTrackedJobState enforces invalid transition rules', async () => {
  const canonicalJobId = 'cf5f273a-1cb0-4892-8cb6-3f48133db13e';
  const service = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: () => new Date(nowIso),
  });

  await service.transitionTrackedJobState('user-2', {
    canonicalJobId,
    targetState: 'discovered',
  });

  await assert.rejects(
    async () =>
      service.transitionTrackedJobState('user-2', {
        canonicalJobId,
        targetState: 'offer',
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'invalid_tracker_transition' &&
      error.statusCode === 400,
  );
});

test('listTrackedJobs filters by state and sorts by latest update', async () => {
  const canonicalJobA = '6777b9f3-8a4e-438b-aad6-e6f26d04c287';
  const canonicalJobB = '4ba9942a-6e03-42e8-b95c-9095e5ef4547';

  let nowCursor = Date.parse('2026-04-12T16:00:00.000Z');
  const service = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        if (id === canonicalJobA) {
          return createCanonicalJob(canonicalJobA);
        }

        if (id === canonicalJobB) {
          return createCanonicalJob(canonicalJobB);
        }

        return null;
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  await service.transitionTrackedJobState('user-3', {
    canonicalJobId: canonicalJobA,
    targetState: 'discovered',
  });

  await service.transitionTrackedJobState('user-3', {
    canonicalJobId: canonicalJobB,
    targetState: 'shortlisted',
  });

  await service.transitionTrackedJobState('user-3', {
    canonicalJobId: canonicalJobA,
    targetState: 'shortlisted',
  });

  const allTrackers = await service.listTrackedJobs({
    userId: 'user-3',
    limit: 10,
  });

  assert.equal(allTrackers.length, 2);
  assert.equal(allTrackers[0]?.canonicalJobId, canonicalJobA);
  assert.equal(allTrackers[1]?.canonicalJobId, canonicalJobB);

  const shortlistedOnly = await service.listTrackedJobs({
    userId: 'user-3',
    state: 'shortlisted',
    limit: 10,
  });

  assert.equal(shortlistedOnly.length, 2);
});

test('transitionTrackedJobState rejects unknown canonical jobs', async () => {
  const service = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob() {
        return null;
      },
    },
  });

  await assert.rejects(
    async () =>
      service.transitionTrackedJobState('user-4', {
        canonicalJobId: '39cd06cc-d1ff-4e57-a4b7-950f2d80a856',
        targetState: 'discovered',
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'canonical_job_not_found' &&
      error.statusCode === 404,
  );
});
