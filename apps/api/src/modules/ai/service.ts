import type {
  ExtractedJob,
  ExtractedResume,
  JobExtractionRequest,
  MatchExplanation,
  MatchExplanationRequest,
  MatchScoreArtifact,
  MatchScoreRequest,
  ResumeExtractionRequest,
  UserPreferences,
} from '@job-hunter/shared';

import { isAiProviderError } from './errors.js';
import { createInMemoryMatchArtifactRepository } from './in-memory-match-artifact-repository.js';
import type { MatchArtifactRepository } from './match-artifact-repository.js';
import {
  createFallbackAiProviderFromEnv,
  createPrimaryAiProviderFromEnv,
} from './provider.js';
import {
  buildDeterministicMatchScore,
  deterministicScoringVersion,
} from './scoring.js';
import type { AiProvider, AiProviderResult } from './types.js';

const aiSchemaVersion = 'ai-schema-v1';

const maxExtractorVersionLength = 64;
const maxModelVersionLength = 128;
const maxScoringVersionLength = 64;

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
  scoreMatch(
    userId: string,
    payload: MatchScoreRequest,
    preferences: UserPreferences,
  ): Promise<{
    artifact: MatchScoreArtifact;
  }>;
  getLatestMatchArtifact(
    userId: string,
    canonicalJobId: string,
  ): Promise<MatchScoreArtifact | null>;
  listMatchArtifacts(
    userId: string,
    canonicalJobId: string,
  ): Promise<MatchScoreArtifact[]>;
}

export interface CreateAiServiceOptions {
  provider?: AiProvider;
  fallbackProvider?: AiProvider | null;
  artifactRepository?: MatchArtifactRepository;
  scoringVersion?: string;
  now?: () => Date;
}

export const createAiService = ({
  provider = createPrimaryAiProviderFromEnv(),
  fallbackProvider,
  artifactRepository = createInMemoryMatchArtifactRepository(),
  scoringVersion = deterministicScoringVersion,
  now = () => new Date(),
}: CreateAiServiceOptions = {}): AiService => {
  const resolvedFallbackProvider =
    fallbackProvider === undefined
      ? createFallbackAiProviderFromEnv(provider)
      : fallbackProvider;

  const resolvedScoringVersion = metadataValue(
    scoringVersion,
    maxScoringVersionLength,
    deterministicScoringVersion,
  );

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

    async scoreMatch(userId, payload, preferences) {
      const deterministicResult = buildDeterministicMatchScore({
        resumeExtraction: payload.resumeExtraction,
        jobExtraction: payload.jobExtraction,
        preferences,
      });

      const explanationRequest: MatchExplanationRequest = {
        userId,
        canonicalJobId: payload.canonicalJobId,
        scoreBreakdown: deterministicResult.scoreBreakdown,
        strengths: deterministicResult.strengths,
        gaps: deterministicResult.gaps,
        dealBreakers: deterministicResult.dealBreakers,
      };

      let explanation: MatchExplanation | null = null;
      let explanationMetadata: ReturnType<typeof createMetadata> | null = null;
      let explanationErrorCode: string | null = null;

      try {
        const explanationResult = await executeWithFallback(
          provider,
          resolvedFallbackProvider,
          async (activeProvider) => activeProvider.explainMatch(explanationRequest),
        );

        explanation = {
          ...explanationResult.output,
          recommendation: deterministicResult.recommendation,
        };

        explanationMetadata = createMetadata(
          explanationResult.extractorVersion,
          explanationResult.modelVersion,
          now,
        );
      } catch (error: unknown) {
        if (isAiProviderError(error)) {
          explanationErrorCode = error.code;
        } else {
          throw error;
        }
      }

      const artifact = await artifactRepository.createArtifact({
        userId,
        canonicalJobId: payload.canonicalJobId,
        scoringVersion: resolvedScoringVersion,
        scoreBreakdown: deterministicResult.scoreBreakdown,
        strengths: deterministicResult.strengths,
        gaps: deterministicResult.gaps,
        dealBreakers: deterministicResult.dealBreakers,
        recommendation: deterministicResult.recommendation,
        explanation,
        explanationMetadata,
        explanationErrorCode,
        scoredAt: now().toISOString(),
      });

      return {
        artifact,
      };
    },

    async getLatestMatchArtifact(userId, canonicalJobId) {
      return artifactRepository.getLatestArtifact(userId, canonicalJobId);
    },

    async listMatchArtifacts(userId, canonicalJobId) {
      return artifactRepository.listArtifacts(userId, canonicalJobId);
    },
  };
};
