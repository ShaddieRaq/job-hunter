import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchScoreArtifact, ReminderTask } from '@job-hunter/shared';

import {
  createNotificationService,
  type HighFitNotificationCandidate,
} from '../../src/modules/notifications/service.js';

const createReminderTask = (overrides?: Partial<ReminderTask>): ReminderTask => ({
  reminderId: '2b0a89d2-b058-4b99-a833-b5bcc245f0ca',
  userId: '8b027aa6-dfd3-4fb5-9276-b6e9a257f543',
  canonicalJobId: 'fcd4d71f-a1d6-4df4-a63a-872455453f69',
  taskType: 'custom',
  title: 'Follow up with recruiter',
  note: null,
  dueAt: '2026-04-12T16:00:00.000Z',
  status: 'pending',
  linkedTrackerEventId: null,
  createdAt: '2026-04-12T15:00:00.000Z',
  updatedAt: '2026-04-12T15:00:00.000Z',
  completedAt: null,
  ...overrides,
});

const createMatchScoreArtifact = (
  overrides?: Partial<MatchScoreArtifact>,
): MatchScoreArtifact => ({
  userId: '8b027aa6-dfd3-4fb5-9276-b6e9a257f543',
  canonicalJobId: 'fcd4d71f-a1d6-4df4-a63a-872455453f69',
  artifactVersion: 1,
  scoringVersion: 'deterministic-v1',
  scoreBreakdown: {
    overallScore: 84,
    titleScore: 85,
    skillScore: 83,
    seniorityScore: 82,
    locationScore: 88,
    compensationScore: 80,
    domainScore: 79,
    requirementScore: 84,
    trajectoryScore: 81,
    penaltyScore: 5,
  },
  strengths: ['Strong TypeScript alignment'],
  gaps: ['No direct fintech background'],
  dealBreakers: [],
  recommendation: 'apply',
  explanation: null,
  explanationMetadata: null,
  explanationErrorCode: null,
  scoredAt: '2026-04-12T15:30:00.000Z',
  ...overrides,
});

const createHighFitCandidate = (
  overrides?: Partial<HighFitNotificationCandidate>,
): HighFitNotificationCandidate => ({
  canonicalJobId: 'fcd4d71f-a1d6-4df4-a63a-872455453f69',
  canonicalCompanyName: 'Acme Labs',
  canonicalTitle: 'Senior Backend Engineer',
  latestScoreArtifact: createMatchScoreArtifact(),
  trackerState: 'reviewing',
  ...overrides,
});

test('dispatchDueReminderNotifications queues and sends due reminders', async () => {
  const userId = '8b027aa6-dfd3-4fb5-9276-b6e9a257f543';
  const referenceTime = '2026-04-12T16:00:00.000Z';

  let nowCursor = Date.parse('2026-04-12T16:00:00.000Z');
  const service = createNotificationService({
    reminderReader: {
      async listReminders(options) {
        if (options.userId !== userId) {
          return [];
        }

        return [
          createReminderTask({
            reminderId: '83d47872-6f3c-4a45-9605-f0bc6ca24da0',
            dueAt: '2026-04-12T15:00:00.000Z',
            title: 'Prepare interview examples',
          }),
          createReminderTask({
            reminderId: '5ffb2a0a-8ac5-4ed0-86b2-b3fcae1eca4f',
            dueAt: '2026-04-12T16:00:00.000Z',
            title: 'Follow up after application submission',
          }),
          createReminderTask({
            reminderId: 'a06db9c0-c9d5-4e26-9170-a23c43008cbc',
            dueAt: '2026-04-13T16:00:00.000Z',
            title: 'Future reminder',
          }),
        ];
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const result = await service.dispatchDueReminderNotifications(userId, {
    referenceTime,
  });

  assert.equal(result.queuedCount, 2);
  assert.equal(result.sentCount, 2);
  assert.equal(result.skippedCount, 0);

  const notifications = await service.listNotifications({
    userId,
    limit: 10,
  });

  assert.equal(notifications.length, 2);
  assert.ok(notifications.every((notification) => notification.status === 'sent'));
  assert.ok(
    notifications.some((notification) =>
      notification.message.includes('Follow up after application submission'),
    ),
  );
});

test('dispatchDueReminderNotifications is idempotent for already dispatched reminders', async () => {
  const userId = '8b027aa6-dfd3-4fb5-9276-b6e9a257f543';

  const service = createNotificationService({
    reminderReader: {
      async listReminders() {
        return [
          createReminderTask({
            reminderId: 'c6702cd2-6401-49ed-8efe-176ceee1f5f2',
          }),
        ];
      },
    },
    now: () => new Date('2026-04-12T16:05:00.000Z'),
  });

  const first = await service.dispatchDueReminderNotifications(userId, {
    referenceTime: '2026-04-12T16:05:00.000Z',
  });

  const second = await service.dispatchDueReminderNotifications(userId, {
    referenceTime: '2026-04-12T16:05:00.000Z',
  });

  assert.equal(first.queuedCount, 1);
  assert.equal(first.sentCount, 1);
  assert.equal(first.skippedCount, 0);

  assert.equal(second.queuedCount, 0);
  assert.equal(second.sentCount, 0);
  assert.equal(second.skippedCount, 1);
});

test('dispatchDueReminderNotifications respects referenceTime override for future reminders', async () => {
  const userId = '8b027aa6-dfd3-4fb5-9276-b6e9a257f543';

  const service = createNotificationService({
    reminderReader: {
      async listReminders() {
        return [
          createReminderTask({
            reminderId: '260b45b9-6ff9-450f-8da7-117e18652242',
            dueAt: '2026-04-13T16:00:00.000Z',
            title: 'Tomorrow follow-up reminder',
          }),
        ];
      },
    },
    now: () => new Date('2026-04-12T16:00:00.000Z'),
  });

  const beforeDue = await service.dispatchDueReminderNotifications(userId, {
    referenceTime: '2026-04-12T16:00:00.000Z',
  });

  assert.equal(beforeDue.queuedCount, 0);
  assert.equal(beforeDue.sentCount, 0);
  assert.equal(beforeDue.skippedCount, 0);

  const afterDue = await service.dispatchDueReminderNotifications(userId, {
    referenceTime: '2026-04-13T16:00:00.000Z',
  });

  assert.equal(afterDue.queuedCount, 1);
  assert.equal(afterDue.sentCount, 1);
  assert.equal(afterDue.skippedCount, 0);

  const sentOnly = await service.listNotifications({
    userId,
    status: 'sent',
    limit: 10,
  });

  assert.equal(sentOnly.length, 1);
  assert.equal(sentOnly[0]?.notificationType, 'reminder_due');
});

test('dispatchHighFitNotifications queues and sends eligible high-fit alerts', async () => {
  const userId = '8b027aa6-dfd3-4fb5-9276-b6e9a257f543';

  const service = createNotificationService({
    reminderReader: {
      async listReminders() {
        return [];
      },
    },
    highFitCandidateReader: {
      async listCandidates() {
        return [
          createHighFitCandidate({
            canonicalJobId: 'cde4f96c-4e6e-4944-9a83-1ac4e919b745',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: 'cde4f96c-4e6e-4944-9a83-1ac4e919b745',
              artifactVersion: 7,
            }),
          }),
          createHighFitCandidate({
            canonicalJobId: '0f4f3778-cef5-4939-b63c-15f083786f1b',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: '0f4f3778-cef5-4939-b63c-15f083786f1b',
              artifactVersion: 8,
              recommendation: 'review',
            }),
          }),
          createHighFitCandidate({
            canonicalJobId: '8f15fc16-2b5d-4d26-a45a-05f80a1eb8e4',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: '8f15fc16-2b5d-4d26-a45a-05f80a1eb8e4',
              artifactVersion: 9,
              scoreBreakdown: {
                overallScore: 74,
                titleScore: 85,
                skillScore: 83,
                seniorityScore: 82,
                locationScore: 88,
                compensationScore: 80,
                domainScore: 79,
                requirementScore: 84,
                trajectoryScore: 81,
                penaltyScore: 5,
              },
            }),
          }),
          createHighFitCandidate({
            canonicalJobId: '2f266d6e-5f71-4f18-8259-a4284f5d2926',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: '2f266d6e-5f71-4f18-8259-a4284f5d2926',
              artifactVersion: 10,
              dealBreakers: ['sponsorship mismatch'],
            }),
          }),
          createHighFitCandidate({
            canonicalJobId: '4e5dbfb8-8bf5-4cd8-a9f5-c594a7f6a0cf',
            trackerState: 'applied',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: '4e5dbfb8-8bf5-4cd8-a9f5-c594a7f6a0cf',
              artifactVersion: 11,
            }),
          }),
        ];
      },
    },
    now: () => new Date('2026-04-12T16:00:00.000Z'),
  });

  const result = await service.dispatchHighFitNotifications(userId, {
    referenceTime: '2026-04-12T16:00:00.000Z',
  });

  assert.equal(result.queuedCount, 1);
  assert.equal(result.sentCount, 1);
  assert.equal(result.skippedCount, 0);

  const notifications = await service.listNotifications({
    userId,
    status: 'sent',
    limit: 10,
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.notificationType, 'high_fit_alert');
  assert.equal(notifications[0]?.reminderId, null);
  assert.equal(notifications[0]?.matchArtifactVersion, 7);
});

test('dispatchHighFitNotifications is idempotent by canonical job and artifact version', async () => {
  const userId = '8b027aa6-dfd3-4fb5-9276-b6e9a257f543';

  const service = createNotificationService({
    reminderReader: {
      async listReminders() {
        return [];
      },
    },
    highFitCandidateReader: {
      async listCandidates() {
        return [
          createHighFitCandidate({
            canonicalJobId: 'd917cbf5-842d-4926-a4f9-9d8a8498cf04',
            latestScoreArtifact: createMatchScoreArtifact({
              canonicalJobId: 'd917cbf5-842d-4926-a4f9-9d8a8498cf04',
              artifactVersion: 12,
            }),
          }),
        ];
      },
    },
    now: () => new Date('2026-04-12T16:00:00.000Z'),
  });

  const first = await service.dispatchHighFitNotifications(userId, {
    referenceTime: '2026-04-12T16:00:00.000Z',
  });
  const second = await service.dispatchHighFitNotifications(userId, {
    referenceTime: '2026-04-12T16:00:00.000Z',
  });

  assert.equal(first.queuedCount, 1);
  assert.equal(first.sentCount, 1);
  assert.equal(first.skippedCount, 0);

  assert.equal(second.queuedCount, 0);
  assert.equal(second.sentCount, 0);
  assert.equal(second.skippedCount, 1);
});
