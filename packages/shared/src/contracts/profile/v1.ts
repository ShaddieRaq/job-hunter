import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';

export const profileContractVersion = 'v1' as const;

const nullableString = (maxLength: number): z.ZodNullable<z.ZodString> =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .nullable();

export const workAuthorizationSchema = z.enum([
  'citizen',
  'permanent_resident',
  'visa',
  'other',
]);

export const userProfilePayloadSchema = z
  .object({
    currentTitle: nullableString(120),
    yearsExperience: z.number().int().min(0).max(60).nullable(),
    summary: nullableString(5000),
    workAuthorization: workAuthorizationSchema.nullable(),
    sponsorshipRequired: z.boolean().nullable(),
    transitionNotes: nullableString(2000),
  })
  .strict();

export const userProfileSchema = userProfilePayloadSchema
  .extend({
    userId: userIdSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type WorkAuthorization = z.infer<typeof workAuthorizationSchema>;
export type UserProfilePayload = z.infer<typeof userProfilePayloadSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
