import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { sourceNameSchema } from '../connectors/v1.js';

export const savedSearchesContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

export const savedSearchIdSchema = z.string().uuid();

export const savedSearchRecommendationFilterSchema = z.enum([
  'high_fit',
  'all',
  'apply',
  'review',
  'skip',
  'unscored',
]);

export const savedSearchRemoteFilterSchema = z.enum([
  'aligned',
  'any',
  'remote',
  'hybrid',
  'onsite',
]);

export const savedSearchSortSchema = z.enum(['fit', 'recent', 'salary']);

export const savedSearchSourceFilterSchema = z.union([
  z.literal('any'),
  sourceNameSchema,
]);

export const savedSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120),
    recommendation: savedSearchRecommendationFilterSchema,
    remote: savedSearchRemoteFilterSchema,
    source: savedSearchSourceFilterSchema.default('any'),
    sort: savedSearchSortSchema,
    includeHidden: z.boolean(),
  })
  .strict();

export const savedSearchSchema = z
  .object({
    savedSearchId: savedSearchIdSchema,
    userId: userIdSchema,
    name: trimmedText(80),
    query: savedSearchQuerySchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastUsedAt: z.string().datetime().nullable(),
  })
  .strict();

export const savedSearchCreateRequestSchema = z
  .object({
    name: trimmedText(80),
    query: savedSearchQuerySchema,
  })
  .strict();

export const savedSearchResponseSchema = z
  .object({
    contractVersion: z.literal(savedSearchesContractVersion),
    savedSearch: savedSearchSchema,
  })
  .strict();

export const savedSearchListResponseSchema = z
  .object({
    contractVersion: z.literal(savedSearchesContractVersion),
    savedSearches: z.array(savedSearchSchema).max(200),
  })
  .strict();

export const savedSearchDeleteResponseSchema = z
  .object({
    contractVersion: z.literal(savedSearchesContractVersion),
    deletedSavedSearchId: savedSearchIdSchema,
  })
  .strict();

export type SavedSearchId = z.infer<typeof savedSearchIdSchema>;
export type SavedSearchRecommendationFilter = z.infer<
  typeof savedSearchRecommendationFilterSchema
>;
export type SavedSearchRemoteFilter = z.infer<typeof savedSearchRemoteFilterSchema>;
export type SavedSearchSort = z.infer<typeof savedSearchSortSchema>;
export type SavedSearchSourceFilter = z.infer<typeof savedSearchSourceFilterSchema>;
export type SavedSearchQuery = z.infer<typeof savedSearchQuerySchema>;
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export type SavedSearchCreateRequest = z.infer<typeof savedSearchCreateRequestSchema>;
export type SavedSearchResponse = z.infer<typeof savedSearchResponseSchema>;
export type SavedSearchListResponse = z.infer<typeof savedSearchListResponseSchema>;
export type SavedSearchDeleteResponse = z.infer<typeof savedSearchDeleteResponseSchema>;
