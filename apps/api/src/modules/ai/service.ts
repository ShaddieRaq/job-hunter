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
import { createDeterministicAiProvider } from './deterministic-provider.js';
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

type ScoreExplanationMode = 'provider' | 'deterministic' | 'off';

const parseScoreExplanationMode = (
  rawValue: string | undefined,
): ScoreExplanationMode => {
  const normalized = rawValue?.trim().toLowerCase();

  if (normalized === 'deterministic') {
    return 'deterministic';
  }

  if (normalized === 'off') {
    return 'off';
  }

  return 'provider';
};

const parseRolloutPercentage = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return 100;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    return 100;
  }

  return Math.max(0, Math.min(100, parsed));
};

const normalizeEvidence = (value: string): string => value.trim().toLowerCase();

const toEvidenceSet = (values: string[]): Set<string> =>
  new Set(values.map((value) => normalizeEvidence(value)).filter((value) => value.length > 0));

const isEvidenceSubset = (values: string[], allowed: Set<string>): boolean =>
  values.every((value) => allowed.has(normalizeEvidence(value)));

const hasEvidenceWhenExpected = (values: string[], expected: string[]): boolean =>
  expected.length === 0 || values.length > 0;

const passesExplanationGuardrails = (
  explanation: MatchExplanation,
  request: MatchExplanationRequest,
): boolean => {
  const allowedStrengths = toEvidenceSet(request.strengths);
  const allowedGaps = toEvidenceSet(request.gaps);
  const allowedDealBreakers = toEvidenceSet(request.dealBreakers);

  return (
    isEvidenceSubset(explanation.strengths, allowedStrengths) &&
    isEvidenceSubset(explanation.gaps, allowedGaps) &&
    isEvidenceSubset(explanation.dealBreakers, allowedDealBreakers) &&
    hasEvidenceWhenExpected(explanation.strengths, request.strengths) &&
    hasEvidenceWhenExpected(explanation.gaps, request.gaps) &&
    hasEvidenceWhenExpected(explanation.dealBreakers, request.dealBreakers)
  );
};

const stableRolloutBucket = (seed: string): number => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % 100;
};

const isInScoreExplanationRollout = (
  userId: string,
  canonicalJobId: string,
  rolloutPercentage: number,
): boolean => {
  if (rolloutPercentage <= 0) {
    return false;
  }

  if (rolloutPercentage >= 100) {
    return true;
  }

  const bucket = stableRolloutBucket(`${userId}:${canonicalJobId}`);
  return bucket < rolloutPercentage;
};

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
  scoreExplanationMode?: ScoreExplanationMode;
  scoreExplanationRolloutPercent?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export const createAiService = ({
  provider = createPrimaryAiProviderFromEnv(),
  fallbackProvider,
  artifactRepository = createInMemoryMatchArtifactRepository(),
  scoringVersion = deterministicScoringVersion,
  scoreExplanationMode,
  scoreExplanationRolloutPercent,
  env = process.env,
  now = () => new Date(),
}: CreateAiServiceOptions = {}): AiService => {
  const resolvedFallbackProvider =
    fallbackProvider === undefined
      ? createFallbackAiProviderFromEnv(provider)
      : fallbackProvider;

  const deterministicProvider = createDeterministicAiProvider();

  const resolvedScoreExplanationMode =
    scoreExplanationMode ?? parseScoreExplanationMode(env.AI_SCORE_EXPLANATION_MODE);

  const resolvedScoreExplanationRolloutPercent =
    scoreExplanationRolloutPercent ??
    parseRolloutPercentage(env.AI_SCORE_EXPLANATION_ROLLOUT_PERCENT);

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

      const buildDeterministicExplanation = async (): Promise<{
        explanation: MatchExplanation;
        metadata: ReturnType<typeof createMetadata>;
      }> => {
        const deterministicExplanationResult = await deterministicProvider.explainMatch(
          explanationRequest,
        );

        return {
          explanation: {
            ...deterministicExplanationResult.output,
            recommendation: deterministicResult.recommendation,
          },
          metadata: createMetadata(
            deterministicExplanationResult.extractorVersion,
            deterministicExplanationResult.modelVersion,
            now,
          ),
        };
      };

      const canUseProviderExplanation =
        resolvedScoreExplanationMode === 'provider' &&
        isInScoreExplanationRollout(
          userId,
          payload.canonicalJobId,
          resolvedScoreExplanationRolloutPercent,
        );

      try {
        if (resolvedScoreExplanationMode === 'off') {
          explanation = null;
          explanationMetadata = null;
          explanationErrorCode = 'explanation_disabled';
        } else if (
          resolvedScoreExplanationMode === 'deterministic' ||
          !canUseProviderExplanation
        ) {
          const deterministicExplanation = await buildDeterministicExplanation();

          explanation = deterministicExplanation.explanation;
          explanationMetadata = deterministicExplanation.metadata;
          explanationErrorCode =
            resolvedScoreExplanationMode === 'provider'
              ? 'explanation_rollout_excluded'
              : null;
        } else {
          const explanationResult = await executeWithFallback(
            provider,
            resolvedFallbackProvider,
            async (activeProvider) => activeProvider.explainMatch(explanationRequest),
          );

          const candidateExplanation: MatchExplanation = {
            ...explanationResult.output,
            recommendation: deterministicResult.recommendation,
          };

          if (!passesExplanationGuardrails(candidateExplanation, explanationRequest)) {
            const deterministicExplanation = await buildDeterministicExplanation();

            explanation = deterministicExplanation.explanation;
            explanationMetadata = deterministicExplanation.metadata;
            explanationErrorCode = 'explanation_guardrail_fallback';
          } else {
            explanation = candidateExplanation;
            explanationMetadata = createMetadata(
              explanationResult.extractorVersion,
              explanationResult.modelVersion,
              now,
            );
          }
        }
      } catch (error: unknown) {
        if (isAiProviderError(error)) {
          const deterministicExplanation = await buildDeterministicExplanation();

          explanation = deterministicExplanation.explanation;
          explanationMetadata = deterministicExplanation.metadata;
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
