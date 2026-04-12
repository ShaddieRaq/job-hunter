import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { remotePreferenceSchema, senioritySchema } from '../preferences/v1.js';

export const aiContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const extractionMetadataSchema = z
  .object({
    schemaVersion: z.string().trim().min(1).max(32),
    extractorVersion: z.string().trim().min(1).max(64),
    modelVersion: z.string().trim().min(1).max(128),
    generatedAt: z.string().datetime(),
  })
  .strict();

export const yearsOfExperienceSchema = z
  .object({
    minimum: z.number().int().min(0).max(50).nullable(),
    maximum: z.number().int().min(0).max(50).nullable(),
  })
  .strict();

export const extractedResumeSchema = z
  .object({
    normalizedSkills: z.array(trimmedText(120)).max(300),
    domains: z.array(trimmedText(120)).max(80),
    experienceRoles: z.array(trimmedText(120)).max(120),
    yearsExperience: yearsOfExperienceSchema,
    inferredSeniority: senioritySchema.nullable(),
    preferredLocations: z.array(trimmedText(120)).max(30),
    remotePreference: remotePreferenceSchema.nullable(),
    sponsorshipRequired: z.boolean().nullable(),
    workAuthorization: nullableTrimmedText(120),
  })
  .strict();

export const extractedJobSchema = z
  .object({
    normalizedTitle: trimmedText(180),
    normalizedSkills: z.array(trimmedText(120)).max(300),
    requiredSkills: z.array(trimmedText(120)).max(200),
    preferredSkills: z.array(trimmedText(120)).max(200),
    requiredYearsExperience: yearsOfExperienceSchema,
    domainTags: z.array(trimmedText(120)).max(100),
    seniority: senioritySchema.nullable(),
    locationConstraint: nullableTrimmedText(120),
    remoteType: remotePreferenceSchema.nullable(),
    sponsorshipAvailable: z.boolean().nullable(),
    salaryMin: z.number().int().min(0).nullable(),
    salaryMax: z.number().int().min(0).nullable(),
    salaryCurrency: nullableTrimmedText(12),
    salaryPeriod: z.enum(['hour', 'month', 'year']).nullable(),
  })
  .strict();

export const resumeExtractionRequestSchema = z
  .object({
    rawText: trimmedText(200_000),
    sourceFilename: trimmedText(240).optional(),
  })
  .strict();

export const resumeExtractionResponseSchema = z
  .object({
    contractVersion: z.literal(aiContractVersion),
    userId: userIdSchema,
    extraction: extractedResumeSchema,
    metadata: extractionMetadataSchema,
  })
  .strict();

export const jobExtractionRequestSchema = z
  .object({
    rawText: trimmedText(200_000),
    sourceJobId: trimmedText(240).optional(),
    sourceName: trimmedText(120).optional(),
  })
  .strict();

export const jobExtractionResponseSchema = z
  .object({
    contractVersion: z.literal(aiContractVersion),
    extraction: extractedJobSchema,
    metadata: extractionMetadataSchema,
  })
  .strict();

export const scoreBreakdownSchema = z
  .object({
    overallScore: z.number().min(0).max(100),
    titleScore: z.number().min(0).max(100),
    skillScore: z.number().min(0).max(100),
    seniorityScore: z.number().min(0).max(100),
    locationScore: z.number().min(0).max(100),
    compensationScore: z.number().min(0).max(100),
    domainScore: z.number().min(0).max(100),
    requirementScore: z.number().min(0).max(100),
    trajectoryScore: z.number().min(0).max(100),
    penaltyScore: z.number().min(0).max(100),
  })
  .strict();

export const matchExplanationRequestSchema = z
  .object({
    userId: userIdSchema,
    canonicalJobId: z.string().uuid(),
    scoreBreakdown: scoreBreakdownSchema,
    strengths: z.array(trimmedText(240)).max(20),
    gaps: z.array(trimmedText(240)).max(20),
    dealBreakers: z.array(trimmedText(240)).max(20),
  })
  .strict();

export const matchExplanationSchema = z
  .object({
    summary: trimmedText(320),
    strengths: z.array(trimmedText(240)).max(10),
    gaps: z.array(trimmedText(240)).max(10),
    dealBreakers: z.array(trimmedText(240)).max(10),
    recommendation: z.enum(['apply', 'review', 'skip']),
  })
  .strict();

export const matchExplanationResponseSchema = z
  .object({
    contractVersion: z.literal(aiContractVersion),
    canonicalJobId: z.string().uuid(),
    explanation: matchExplanationSchema,
    metadata: extractionMetadataSchema,
  })
  .strict();

export type ExtractedResume = z.infer<typeof extractedResumeSchema>;
export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type ResumeExtractionRequest = z.infer<typeof resumeExtractionRequestSchema>;
export type ResumeExtractionResponse = z.infer<typeof resumeExtractionResponseSchema>;
export type JobExtractionRequest = z.infer<typeof jobExtractionRequestSchema>;
export type JobExtractionResponse = z.infer<typeof jobExtractionResponseSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type MatchExplanationRequest = z.infer<typeof matchExplanationRequestSchema>;
export type MatchExplanation = z.infer<typeof matchExplanationSchema>;
export type MatchExplanationResponse = z.infer<typeof matchExplanationResponseSchema>;
