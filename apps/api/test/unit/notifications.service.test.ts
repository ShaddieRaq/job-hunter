import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReminderTask } from '@job-hunter/shared';

import { createNotificationService } from '../../src/modules/notifications/service.js';

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
