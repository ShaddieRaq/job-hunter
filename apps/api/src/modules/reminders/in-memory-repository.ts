import type {
  ReminderTask,
  ReminderId,
} from '@job-hunter/shared';

import type { ReminderRepository } from './repository.js';

const trackerEventKey = (userId: string, trackerEventId: string): string =>
  `${userId}:${trackerEventId}`;

const cloneReminder = (reminder: ReminderTask): ReminderTask => ({
  ...reminder,
});

export const createInMemoryReminderRepository = (): ReminderRepository => {
  const remindersById = new Map<ReminderId, ReminderTask>();
  const reminderIdsByTrackerEvent = new Map<string, ReminderId>();

  return {
    async createReminder(reminder) {
      remindersById.set(reminder.reminderId, cloneReminder(reminder));

      if (reminder.linkedTrackerEventId) {
        reminderIdsByTrackerEvent.set(
          trackerEventKey(reminder.userId, reminder.linkedTrackerEventId),
          reminder.reminderId,
        );
      }

      return cloneReminder(reminder);
    },

    async updateReminder(reminder) {
      remindersById.set(reminder.reminderId, cloneReminder(reminder));

      if (reminder.linkedTrackerEventId) {
        reminderIdsByTrackerEvent.set(
          trackerEventKey(reminder.userId, reminder.linkedTrackerEventId),
          reminder.reminderId,
        );
      }

      return cloneReminder(reminder);
    },

    async findReminderById(userId, reminderId) {
      const reminder = remindersById.get(reminderId);
      if (!reminder || reminder.userId !== userId) {
        return null;
      }

      return cloneReminder(reminder);
    },

    async findReminderByTrackerEvent(userId, trackerEventId) {
      const reminderId = reminderIdsByTrackerEvent.get(
        trackerEventKey(userId, trackerEventId),
      );

      if (!reminderId) {
        return null;
      }

      const reminder = remindersById.get(reminderId);
      if (!reminder || reminder.userId !== userId) {
        return null;
      }

      return cloneReminder(reminder);
    },

    async listReminders({ userId, status, canonicalJobId, limit }) {
      const reminders = [...remindersById.values()]
        .filter((reminder) => reminder.userId === userId)
        .filter((reminder) => (status ? reminder.status === status : true))
        .filter((reminder) =>
          canonicalJobId ? reminder.canonicalJobId === canonicalJobId : true,
        )
        .sort((left, right) => {
          if (left.status !== right.status) {
            return left.status.localeCompare(right.status);
          }

          if (left.dueAt !== right.dueAt) {
            return left.dueAt.localeCompare(right.dueAt);
          }

          return right.createdAt.localeCompare(left.createdAt);
        })
        .slice(0, limit)
        .map(cloneReminder);

      return reminders;
    },
  };
};
