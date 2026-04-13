import type {
  MatchExplanation,
  ScoreBreakdown,
} from '@job-hunter/shared';

import type { MatchScoreArtifact } from '@job-hunter/shared';

export interface CreateMatchScoreArtifactInput {
  userId: string;
  canonicalJobId: string;
  scoringVersion: string;
  scoreBreakdown: ScoreBreakdown;
  strengths: string[];
  gaps: string[];
  dealBreakers: string[];
  recommendation: 'apply' | 'review' | 'skip';
  explanation: MatchExplanation | null;
  explanationMetadata: MatchScoreArtifact['explanationMetadata'];
  explanationErrorCode: string | null;
  scoredAt: string;
}

export interface MatchArtifactRepository {
  createArtifact(input: CreateMatchScoreArtifactInput): Promise<MatchScoreArtifact>;
  getLatestArtifact(
    userId: string,
    canonicalJobId: string,
  ): Promise<MatchScoreArtifact | null>;
  listArtifacts(userId: string, canonicalJobId: string): Promise<MatchScoreArtifact[]>;
}