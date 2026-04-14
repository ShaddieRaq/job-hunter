import { z } from 'zod';

export const atsTargetsContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const atsVendorSchema = z.enum([
  'greenhouse',
  'lever',
  'workable',
  'ashby',
  'smartrecruiters',
  'recruitee',
]);

export const atsTargetIdentifierTypeSchema = z.enum([
  'board_token',
  'handle',
  'subdomain',
  'slug',
]);

export const atsTargetVerificationStatusSchema = z.enum([
  'verified',
  'failed',
  'pending',
  'stale',
]);

export const atsTargetIdSchema = z.string().uuid();
export const companyRegistryIdSchema = z.string().uuid();
export const atsTargetVerificationEventIdSchema = z.string().uuid();

export const atsTargetCompanySchema = z
  .object({
    companyId: companyRegistryIdSchema,
    canonicalName: trimmedText(200),
    normalizedName: trimmedText(200),
    websiteDomain: nullableTrimmedText(255),
    sourceProvenance: trimmedText(4_000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const atsTargetRecordSchema = z
  .object({
    targetId: atsTargetIdSchema,
    companyId: companyRegistryIdSchema,
    atsVendor: atsVendorSchema,
    identifierType: atsTargetIdentifierTypeSchema,
    identifierValue: trimmedText(240),
    verificationStatus: atsTargetVerificationStatusSchema,
    verificationConfidence: z.number().min(0).max(1).nullable(),
    verificationReason: nullableTrimmedText(240),
    lastVerifiedAt: z.string().datetime().nullable(),
    nextVerificationAt: z.string().datetime().nullable(),
    sourceProvenance: trimmedText(4_000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    company: atsTargetCompanySchema,
  })
  .strict();

export const atsTargetWriteCompanySchema = z
  .object({
    canonicalName: trimmedText(200),
    websiteDomain: nullableTrimmedText(255).optional(),
    sourceProvenance: trimmedText(240).optional(),
  })
  .strict();

export const atsTargetCreateRequestSchema = z
  .object({
    company: atsTargetWriteCompanySchema,
    atsVendor: atsVendorSchema,
    identifierType: atsTargetIdentifierTypeSchema,
    identifierValue: trimmedText(240),
    verificationStatus: atsTargetVerificationStatusSchema.optional(),
    verificationConfidence: z.number().min(0).max(1).nullable().optional(),
    verificationReason: nullableTrimmedText(240).optional(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
    nextVerificationAt: z.string().datetime().nullable().optional(),
    sourceProvenance: trimmedText(240).optional(),
  })
  .strict();

export const atsTargetUpdateRequestSchema = z
  .object({
    verificationStatus: atsTargetVerificationStatusSchema.optional(),
    verificationConfidence: z.number().min(0).max(1).nullable().optional(),
    verificationReason: nullableTrimmedText(240).optional(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
    nextVerificationAt: z.string().datetime().nullable().optional(),
    sourceProvenance: trimmedText(240).optional(),
  })
  .strict();

export const atsTargetListResponseSchema = z
  .object({
    contractVersion: z.literal(atsTargetsContractVersion),
    atsTargets: z.array(atsTargetRecordSchema).max(500),
  })
  .strict();

export const atsTargetResponseSchema = z
  .object({
    contractVersion: z.literal(atsTargetsContractVersion),
    atsTarget: atsTargetRecordSchema,
  })
  .strict();

export const atsTargetVerificationEventSchema = z
  .object({
    eventId: atsTargetVerificationEventIdSchema,
    targetId: atsTargetIdSchema,
    attemptedAt: z.string().datetime(),
    outcomeStatus: atsTargetVerificationStatusSchema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    errorCode: nullableTrimmedText(240),
    evidenceSummary: trimmedText(240),
  })
  .strict();

export const atsTargetVerificationEventListResponseSchema = z
  .object({
    contractVersion: z.literal(atsTargetsContractVersion),
    verificationEvents: z.array(atsTargetVerificationEventSchema).max(500),
  })
  .strict();

export type AtsVendor = z.infer<typeof atsVendorSchema>;
export type AtsTargetIdentifierType = z.infer<typeof atsTargetIdentifierTypeSchema>;
export type AtsTargetVerificationStatus = z.infer<
  typeof atsTargetVerificationStatusSchema
>;
export type AtsTargetId = z.infer<typeof atsTargetIdSchema>;
export type CompanyRegistryId = z.infer<typeof companyRegistryIdSchema>;
export type AtsTargetVerificationEventId = z.infer<
  typeof atsTargetVerificationEventIdSchema
>;
export type AtsTargetCompany = z.infer<typeof atsTargetCompanySchema>;
export type AtsTargetRecord = z.infer<typeof atsTargetRecordSchema>;
export type AtsTargetCreateRequest = z.infer<typeof atsTargetCreateRequestSchema>;
export type AtsTargetUpdateRequest = z.infer<typeof atsTargetUpdateRequestSchema>;
export type AtsTargetListResponse = z.infer<typeof atsTargetListResponseSchema>;
export type AtsTargetResponse = z.infer<typeof atsTargetResponseSchema>;
export type AtsTargetVerificationEvent = z.infer<
  typeof atsTargetVerificationEventSchema
>;
export type AtsTargetVerificationEventListResponse = z.infer<
  typeof atsTargetVerificationEventListResponseSchema
>;