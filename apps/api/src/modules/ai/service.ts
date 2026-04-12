import type {
  ExtractedJob,
  ExtractedResume,
  JobExtractionRequest,
  MatchExplanation,
  MatchExplanationRequest,
  ResumeExtractionRequest,
} from '@job-hunter/shared';

import { isAiProviderError } from './errors.js';
import {
  createFallbackAiProviderFromEnv,
  createPrimaryAiProviderFromEnv,
} from './provider.js';
import type { AiProvider, AiProviderResult } from './types.js';

const aiSchemaVersion = 'ai-schema-v1';

const maxExtractorVersionLength = 64;
const maxModelVersionLength = 128;

const metadataValue = (
  value: string,
  maxLength: number,
  fallbackValue: string,
): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fallbackValue;
  }

  return normalized.slice(0, maxLength);
};

const createMetadata = (
  extractorVersion: string,
  modelVersion: string,
  now: () => Date,
) => ({
  schemaVersion: aiSchemaVersion,
  extractorVersion: metadataValue(
    extractorVersion,
    maxExtractorVersionLength,
    'unknown-extractor',
  ),
  modelVersion: metadataValue(modelVersion, maxModelVersionLength, 'unknown-model'),
  generatedAt: now().toISOString(),
});

const fallbackEligibleErrorCodes = new Set([
  'invalid_json_schema',
  'provider_timeout',
  'provider_refusal',
  'provider_http_error',
]);

const withFallback = (extractorVersion: string, reasonCode: string): string =>
  `${extractorVersion}+fallback-${reasonCode}`.slice(0, maxExtractorVersionLength);

const executeWithFallback = async <T>(
  provider: AiProvider,
  fallbackProvider: AiProvider | null,
  operation: (activeProvider: AiProvider) => Promise<AiProviderResult<T>>,
): Promise<AiProviderResult<T>> => {
  try {
    return await operation(provider);
  } catch (error: unknown) {
    if (
      !fallbackProvider ||
      !isAiProviderError(error) ||
      !fallbackEligibleErrorCodes.has(error.code)
    ) {
      throw error;
    }

    const fallbackResult = await operation(fallbackProvider);
    return {
      ...fallbackResult,
      extractorVersion: withFallback(fallbackResult.extractorVersion, error.code),
    };
  }
};

export interface AiService {
  extractResume(
    userId: string,
    payload: ResumeExtractionRequest,
  ): Promise<{
    userId: string;
    extraction: ExtractedResume;
    metadata: ReturnType<typeof createMetadata>;
  }>;
  extractJob(payload: JobExtractionRequest): Promise<{
    extraction: ExtractedJob;
    metadata: ReturnType<typeof createMetadata>;
  }>;
  explainMatch(payload: MatchExplanationRequest): Promise<{
    canonicalJobId: string;
    explanation: MatchExplanation;
    metadata: ReturnType<typeof createMetadata>;
  }>;
}

export interface CreateAiServiceOptions {
  provider?: AiProvider;
  fallbackProvider?: AiProvider | null;
  now?: () => Date;
}

export const createAiService = ({
  provider = createPrimaryAiProviderFromEnv(),
  fallbackProvider,
  now = () => new Date(),
}: CreateAiServiceOptions = {}): AiService => {
  const resolvedFallbackProvider =
    fallbackProvider === undefined
      ? createFallbackAiProviderFromEnv(provider)
      : fallbackProvider;

  return {
    async extractResume(userId, payload) {
      const result = await executeWithFallback(
        provider,
        resolvedFallbackProvider,
        async (activeProvider) => activeProvider.extractResume(payload),
      );

      return {
        userId,
        extraction: result.output,
        metadata: createMetadata(result.extractorVersion, result.modelVersion, now),
      };
    },

    async extractJob(payload) {
      const result = await executeWithFallback(
        provider,
        resolvedFallbackProvider,
        async (activeProvider) => activeProvider.extractJob(payload),
      );

      return {
        extraction: result.output,
        metadata: createMetadata(result.extractorVersion, result.modelVersion, now),
      };
    },

    async explainMatch(payload) {
      const result = await executeWithFallback(
        provider,
        resolvedFallbackProvider,
        async (activeProvider) => activeProvider.explainMatch(payload),
      );

      return {
        canonicalJobId: payload.canonicalJobId,
        explanation: result.output,
        metadata: createMetadata(result.extractorVersion, result.modelVersion, now),
      };
    },
  };
};
