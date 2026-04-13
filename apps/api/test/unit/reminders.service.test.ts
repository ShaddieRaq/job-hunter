import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CanonicalJobDetail,
  CanonicalJobId,
  TrackerTransitionEvent,
} from '@job-hunter/shared';

import { HttpError } from '../../src/http/http-errors.js';
import { createReminderService } from '../../src/modules/reminders/service.js';

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

const createTrackerTransitionEvent = (
  overrides?: Partial<TrackerTransitionEvent>,
): TrackerTransitionEvent => ({
  eventId: '2f5f5e70-c53f-4f4f-89d3-6d8fe299b9e4',
  userId: '9c7306dc-fd08-4202-ad5e-26579de9d866',
  canonicalJobId: 'e9d3d2f9-65a3-4576-8a63-355ef9447524',
  fromState: 'ready_to_apply',
  toState: 'applied',
  note: 'submitted',
  transitionedAt: nowIso,
  ...overrides,
});

test('createReminder stores pending reminder and normalizes note', async () => {
  const canonicalJobId = 'dd66e25c-5249-45ec-9c20-e41a5d8e45f2';
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: () => new Date(nowIso),
  });

  const created = await service.createReminder('4ce734af-5c41-4bf7-a8c0-ee4f8f2af31f', {
    canonicalJobId,
    taskType: 'custom',
    title: '  Send thank-you follow-up  ',
    note: '  Include portfolio link  ',
    dueAt: '2026-04-14T16:00:00.000Z',
  });

  assert.equal(created.status, 'pending');
  assert.equal(created.title, 'Send thank-you follow-up');
  assert.equal(created.note, 'Include portfolio link');
  assert.equal(created.linkedTrackerEventId, null);
});

test('createReminder rejects unknown canonical job', async () => {
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob() {
        return null;
      },
    },
  });

  await assert.rejects(
    async () =>
      service.createReminder('9eb824ef-a2e5-45ab-9138-ef0e9e93248d', {
        canonicalJobId: 'cd5b0f18-5bd8-40c2-b0be-436f6e9bf9f5',
        taskType: 'custom',
        title: 'Follow up',
        dueAt: '2026-04-14T16:00:00.000Z',
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'canonical_job_not_found' &&
      error.statusCode === 404,
  );
});

test('completeReminder marks reminder complete and is idempotent', async () => {
  const canonicalJobId = '0c9fb83f-cbd4-44a9-baf5-57bd48c6452b';
  const userId = '3034ca2f-d026-4ce3-af7a-bf50da43453c';

  let nowCursor = Date.parse(nowIso);
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const created = await service.createReminder(userId, {
    canonicalJobId,
    taskType: 'custom',
    title: 'Reach out to recruiter',
    dueAt: '2026-04-15T16:00:00.000Z',
  });

  const completed = await service.completeReminder(userId, created.reminderId, {
    note: 'Done after interview',
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.note, 'Done after interview');
  assert.ok(completed.completedAt);

  const completedAgain = await service.completeReminder(userId, created.reminderId, {
    note: 'Second note should be ignored once complete',
  });

  assert.equal(completedAgain.status, 'completed');
  assert.equal(completedAgain.note, 'Done after interview');
  assert.equal(completedAgain.completedAt, completed.completedAt);
});

test('completeReminder rejects unknown reminder id', async () => {
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob() {
        return createCanonicalJob('11c87a63-1084-47ca-b74f-dde27cf53e35');
      },
    },
  });

  await assert.rejects(
    async () =>
      service.completeReminder(
        '6d0ed17a-4ec2-4dbc-96d7-c0c4cb8e88be',
        '815f9022-7df2-4d5d-9f29-f1064bbfbe12',
        {},
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'reminder_not_found' &&
      error.statusCode === 404,
  );
});

test('onTrackerTransition creates one application follow-up reminder per event', async () => {
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return createCanonicalJob(id);
      },
    },
    now: () => new Date('2026-04-12T16:10:00.000Z'),
  });

  const event = createTrackerTransitionEvent();

  await service.onTrackerTransition(event);
  await service.onTrackerTransition(event);

  const reminders = await service.listReminders({
    userId: event.userId,
    limit: 20,
  });

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]?.taskType, 'application_follow_up');
  assert.equal(reminders[0]?.linkedTrackerEventId, event.eventId);
  assert.equal(reminders[0]?.dueAt, '2026-04-19T16:00:00.000Z');
});

test('onTrackerTransition ignores unsupported states', async () => {
  const service = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return createCanonicalJob(id);
      },
    },
  });

  await service.onTrackerTransition(
    createTrackerTransitionEvent({
      eventId: '7e9a9c6a-1c62-48aa-840c-ff8b603638f1',
      toState: 'shortlisted',
      fromState: 'reviewing',
    }),
  );

  const reminders = await service.listReminders({
    userId: '9c7306dc-fd08-4202-ad5e-26579de9d866',
    limit: 20,
  });

  assert.equal(reminders.length, 0);
});
