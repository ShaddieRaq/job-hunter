import type { MatchScoreArtifact } from '@job-hunter/shared';

import type {
  CreateMatchScoreArtifactInput,
  MatchArtifactRepository,
} from './match-artifact-repository.js';

const buildKey = (userId: string, canonicalJobId: string): string =>
  `${userId}:${canonicalJobId}`;

const cloneArtifact = (artifact: MatchScoreArtifact): MatchScoreArtifact =>
  structuredClone(artifact);

export const createInMemoryMatchArtifactRepository = (): MatchArtifactRepository => {
  const store = new Map<string, MatchScoreArtifact[]>();

  return {
    async createArtifact(input: CreateMatchScoreArtifactInput) {
      const key = buildKey(input.userId, input.canonicalJobId);
      const existing = store.get(key) ?? [];
      const nextVersion = existing.length + 1;

      const artifact: MatchScoreArtifact = {
        userId: input.userId,
        canonicalJobId: input.canonicalJobId,
        artifactVersion: nextVersion,
        scoringVersion: input.scoringVersion,
        scoreBreakdown: input.scoreBreakdown,
        strengths: [...input.strengths],
        gaps: [...input.gaps],
        dealBreakers: [...input.dealBreakers],
        recommendation: input.recommendation,
        explanation: input.explanation,
        explanationMetadata: input.explanationMetadata,
        explanationErrorCode: input.explanationErrorCode,
        scoredAt: input.scoredAt,
      };

      existing.push(artifact);
      store.set(key, existing);

      return cloneArtifact(artifact);
    },

    async getLatestArtifact(userId, canonicalJobId) {
      const existing = store.get(buildKey(userId, canonicalJobId));
      if (!existing || existing.length === 0) {
        return null;
      }

      return cloneArtifact(existing[existing.length - 1]);
    },

    async listArtifacts(userId, canonicalJobId) {
      const existing = store.get(buildKey(userId, canonicalJobId));
      if (!existing || existing.length === 0) {
        return [];
      }

      return [...existing]
        .sort((left, right) => right.artifactVersion - left.artifactVersion)
        .map(cloneArtifact);
    },
  };
};