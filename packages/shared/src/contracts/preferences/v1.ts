import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';

export const preferencesContractVersion = 'v1' as const;

const preferenceTextSchema = z.string().trim().min(1).max(120);

export const remotePreferenceSchema = z.enum([
  'remote',
  'hybrid',
  'onsite',
  'flexible',
]);

export const senioritySchema = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
]);

export const notificationPreferencesSchema = z
  .object({
    dailyDigest: z.boolean(),
    weeklyDigest: z.boolean(),
    instantHighFit: z.boolean(),
  })
  .strict();

export const userPreferencesPayloadSchema = z
  .object({
    preferredTitles: z.array(preferenceTextSchema).max(20),
    preferredIndustries: z.array(preferenceTextSchema).max(20),
    preferredSkills: z.array(preferenceTextSchema).max(100),
    preferredLocations: z.array(preferenceTextSchema).max(20),
    remotePreference: remotePreferenceSchema,
    targetSeniorityMin: senioritySchema.nullable(),
    targetSeniorityMax: senioritySchema.nullable(),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable(),
    salaryTarget: z.number().int().min(0).max(10_000_000).nullable(),
    dealBreakers: z.array(preferenceTextSchema).max(20),
    hiddenCompanies: z.array(preferenceTextSchema).max(50),
    hiddenTitles: z.array(preferenceTextSchema).max(50),
    stretchPreferenceLevel: z.number().int().min(1).max(5),
    notificationPreferences: notificationPreferencesSchema,
  })
  .strict();

export const userPreferencesSchema = userPreferencesPayloadSchema
  .extend({
    userId: userIdSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type RemotePreference = z.infer<typeof remotePreferenceSchema>;
export type Seniority = z.infer<typeof senioritySchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export type UserPreferencesPayload = z.infer<typeof userPreferencesPayloadSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
