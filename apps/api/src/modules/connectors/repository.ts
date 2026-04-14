import type {
  SourceConnector,
  SourceJobSummary,
  SourceName,
} from '@job-hunter/shared';

import type { ConnectorJobCandidate } from './types.js';

export interface SourceJobRecord extends SourceJobSummary {
  descriptionText: string;
  rawPayload: unknown;
}

export type UpsertSourceJobResult = 'inserted' | 'updated' | 'unchanged';

export interface UpsertSourceJobInput {
  sourceName: SourceName;
  fetchedAt: string;
  observedAt: string;
  checksumSha256: string;
  job: ConnectorJobCandidate;
}

export interface ConnectorRepository {
  listConnectorStates(): Promise<SourceConnector[]>;
  upsertConnectorState(state: SourceConnector): Promise<void>;

  upsertSourceJob(input: UpsertSourceJobInput): Promise<UpsertSourceJobResult>;
  listSourceJobs(options: {
    sourceName?: SourceName;
    limit?: number;
  }): Promise<SourceJobSummary[]>;
  findSourceJob(
    sourceName: SourceName,
    sourceJobId: string,
  ): Promise<SourceJobRecord | null>;
}
