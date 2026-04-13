import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { canonicalJobIdSchema } from '../jobs/v1.js';
import { reminderIdSchema } from '../reminders/v1.js';

export const notificationsContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const notificationIdSchema = z.string().uuid();

export const notificationTypeSchema = z.enum(['reminder_due', 'high_fit_alert']);

export const notificationChannelSchema = z.enum(['in_app']);

export const notificationStatusSchema = z.enum(['queued', 'sent', 'failed']);

export const notificationLogSchema = z
  .object({
    notificationId: notificationIdSchema,
    userId: userIdSchema,
    reminderId: reminderIdSchema.nullable(),
    canonicalJobId: canonicalJobIdSchema,
    matchArtifactVersion: z.number().int().min(1).max(1_000_000).nullable(),
    notificationType: notificationTypeSchema,
    channel: notificationChannelSchema,
    status: notificationStatusSchema,
    message: trimmedText(500),
    scheduledFor: z.string().datetime(),
    sentAt: z.string().datetime().nullable(),
    failedAt: z.string().datetime().nullable(),
    errorCode: nullableTrimmedText(120),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const notificationDispatchRequestSchema = z
  .object({
    referenceTime: z.string().datetime().optional(),
  })
  .strict();

export const notificationListResponseSchema = z
  .object({
    contractVersion: z.literal(notificationsContractVersion),
    notifications: z.array(notificationLogSchema).max(500),
  })
  .strict();

export const notificationDispatchResponseSchema = z
  .object({
    contractVersion: z.literal(notificationsContractVersion),
    queuedCount: z.number().int().min(0).max(500),
    sentCount: z.number().int().min(0).max(500),
    skippedCount: z.number().int().min(0).max(500),
  })
  .strict();

export const notificationDispatchAllUsersResponseSchema = z
  .object({
    contractVersion: z.literal(notificationsContractVersion),
    attemptedUsers: z.number().int().min(0).max(10_000),
    dispatchedUsers: z.number().int().min(0).max(10_000),
    failedUsers: z.number().int().min(0).max(10_000),
    queuedCount: z.number().int().min(0).max(500_000),
    sentCount: z.number().int().min(0).max(500_000),
    skippedCount: z.number().int().min(0).max(500_000),
    errors: z.array(trimmedText(500)).max(500),
  })
  .strict();

export type NotificationId = z.infer<typeof notificationIdSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type NotificationLog = z.infer<typeof notificationLogSchema>;
export type NotificationDispatchRequest = z.infer<
  typeof notificationDispatchRequestSchema
>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationDispatchResponse = z.infer<
  typeof notificationDispatchResponseSchema
>;
export type NotificationDispatchAllUsersResponse = z.infer<
  typeof notificationDispatchAllUsersResponseSchema
>;
