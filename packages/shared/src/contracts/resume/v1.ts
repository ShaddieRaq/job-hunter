import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { senioritySchema } from '../preferences/v1.js';

export const resumeContractVersion = 'v1' as const;

export const resumeIdSchema = z.string().uuid();

const trimmedText = (maxLength: number): z.ZodString =>
  z.string().trim().min(1).max(maxLength);

const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const checksumSha256Pattern = /^[a-f0-9]{64}$/;

export const resumeContentTypeSchema = z.enum([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const resumeUploadRequestSchema = z
  .object({
    originalFilename: trimmedText(255),
    contentType: resumeContentTypeSchema,
    contentBase64: z
      .string()
      .trim()
      .min(1)
      .max(10_000_000)
      .refine((value) => base64Pattern.test(value), {
        message: 'Expected base64-encoded file content',
      }),
  })
  .strict();

export const resumeParseStatusSchema = z.enum([
  'parsed',
  'unsupported_format',
  'failed',
]);

const profileListValueSchema = trimmedText(120);

export const resumeMetadataSchema = z
  .object({
    resumeId: resumeIdSchema,
    userId: userIdSchema,
    originalFilename: trimmedText(255),
    contentType: resumeContentTypeSchema,
    fileUri: z.string().trim().min(1).max(2048),
    sizeBytes: z.number().int().min(1).max(25_000_000),
    checksumSha256: z.string().regex(checksumSha256Pattern),
    parserVersion: trimmedText(64),
    parseStatus: resumeParseStatusSchema,
    uploadedAt: z.string().datetime(),
    parsedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const resumeStructuredProfileSchema = z
  .object({
    resumeId: resumeIdSchema,
    normalizedSkills: z.array(profileListValueSchema).max(200),
    experienceRoles: z.array(profileListValueSchema).max(100),
    companies: z.array(profileListValueSchema).max(100),
    industries: z.array(profileListValueSchema).max(100),
    education: z.array(profileListValueSchema).max(100),
    certifications: z.array(profileListValueSchema).max(100),
    inferredSeniority: senioritySchema.nullable(),
    extractionConfidence: z.number().min(0).max(1),
    extractedAt: z.string().datetime(),
  })
  .strict();

export const resumeUploadResponseSchema = z
  .object({
    contractVersion: z.literal(resumeContractVersion),
    resume: resumeMetadataSchema,
    structuredProfile: resumeStructuredProfileSchema.nullable(),
  })
  .strict();

export const resumeListResponseSchema = z
  .object({
    contractVersion: z.literal(resumeContractVersion),
    resumes: z.array(resumeMetadataSchema),
  })
  .strict();

export const resumeDetailsResponseSchema = z
  .object({
    contractVersion: z.literal(resumeContractVersion),
    resume: resumeMetadataSchema,
    structuredProfile: resumeStructuredProfileSchema.nullable(),
  })
  .strict();

export type ResumeId = z.infer<typeof resumeIdSchema>;
export type ResumeContentType = z.infer<typeof resumeContentTypeSchema>;
export type ResumeUploadRequest = z.infer<typeof resumeUploadRequestSchema>;
export type ResumeParseStatus = z.infer<typeof resumeParseStatusSchema>;
export type ResumeMetadata = z.infer<typeof resumeMetadataSchema>;
export type ResumeStructuredProfile = z.infer<
  typeof resumeStructuredProfileSchema
>;
export type ResumeUploadResponse = z.infer<typeof resumeUploadResponseSchema>;
export type ResumeListResponse = z.infer<typeof resumeListResponseSchema>;
export type ResumeDetailsResponse = z.infer<typeof resumeDetailsResponseSchema>;