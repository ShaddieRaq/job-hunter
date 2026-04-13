import { createHash } from 'node:crypto';

import type {
  ConnectorSyncRequest,
  ConnectorSyncResponse,
  SourceConnector,
  SourceConnectorHealthStatus,
  SourceJobSummary,
  SourceName,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { createInMemoryConnectorRepository } from './in-memory-repository.js';
import type {
  ConnectorRepository,
  SourceJobRecord,
  UpsertSourceJobResult,
} from './repository.js';
import { connectorJobCandidateSchema, type SourceConnectorDefinition } from './types.js';

const defaultSourceJobLimit = 50;
const maxSourceJobLimit = 500;
const maxSyncErrorsInResponse = 200;
const maxSyncErrorLength = 240;

const sanitizeSyncError = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 'connector sync error';
  }

  if (normalized.length <= maxSyncErrorLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxSyncErrorLength - 3)}...`;
};

const capSyncErrorsForResponse = (
  errors: string[],
): {
  failedCount: number;
  responseErrors: string[];
} => {
  const failedCount = errors.length;
  if (failedCount <= maxSyncErrorsInResponse) {
    return {
      failedCount,
      responseErrors: errors,
    };
  }

  const omittedCount = failedCount - (maxSyncErrorsInResponse - 1);
  return {
    failedCount,
    responseErrors: [
      ...errors.slice(0, maxSyncErrorsInResponse - 1),
      sanitizeSyncError(`Additional sync errors omitted: ${omittedCount}`),
    ],
  };
};

const toChecksumSha256 = (value: unknown): string => {
  const serialized = JSON.stringify(value) ?? 'null';
  return createHash('sha256').update(serialized).digest('hex');
};

const summarizeValidationIssue = (
  sourceName: SourceName,
  issue: { code: string; path: (string | number)[]; message: string },
): string => {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
  return `${sourceName} invalid candidate (${path}): ${issue.message} [${issue.code}]`;
};

const getErrorCode = (error: unknown): string => {
  if (error instanceof HttpError) {
    return error.code;
  }

  return 'source_connector_sync_failed';
};

const upsertResultCounts = (
  result: UpsertSourceJobResult,
): {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
} => {
  if (result === 'inserted') {
    return {
      insertedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
    };
  }

  if (result === 'updated') {
    return {
      insertedCount: 0,
      updatedCount: 1,
      unchangedCount: 0,
    };
  }

  return {
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 1,
  };
};

const toSourceJobSummary = (record: SourceJobRecord): SourceJobSummary => {
  const { descriptionText: _descriptionText, rawPayload: _rawPayload, ...summary } = record;
  return summary;
};

export interface ConnectorService {
  listConnectors(): Promise<SourceConnector[]>;
  syncConnector(
    sourceName: SourceName,
    request: ConnectorSyncRequest,
  ): Promise<Omit<ConnectorSyncResponse, 'contractVersion'>>;
  getSourceJob(
    sourceName: SourceName,
    sourceJobId: string,
  ): Promise<SourceJobSummary | null>;
  listSourceJobs(options?: {
    sourceName?: SourceName;
    limit?: number;
  }): Promise<SourceJobSummary[]>;
}

export interface CreateConnectorServiceOptions {
  connectors: SourceConnectorDefinition[];
  repository?: ConnectorRepository;
  now?: () => Date;
}

export const createConnectorService = ({
  connectors,
  repository = createInMemoryConnectorRepository(),
  now = () => new Date(),
}: CreateConnectorServiceOptions): ConnectorService => {
  const connectorMap = new Map<SourceName, SourceConnectorDefinition>();

  for (const connector of connectors) {
    if (connectorMap.has(connector.sourceName)) {
      throw new Error(`duplicate connector sourceName: ${connector.sourceName}`);
    }

    connectorMap.set(connector.sourceName, connector);
  }

  const getConnectorOrThrow = (sourceName: SourceName): SourceConnectorDefinition => {
    const connector = connectorMap.get(sourceName);
    if (!connector) {
      throw new HttpError(404, 'source_connector_not_found', {
        sourceName,
      });
    }

    return connector;
  };

  const getExistingStateByName = async (): Promise<Map<SourceName, SourceConnector>> => {
    const existingStates = await repository.listConnectorStates();
    return new Map(existingStates.map((state) => [state.sourceName, state]));
  };

  const listConnectors = async (): Promise<SourceConnector[]> => {
    const stateByName = await getExistingStateByName();

    return [...connectorMap.values()]
      .map((connector) => {
        const existing = stateByName.get(connector.sourceName);

        return {
          sourceName: connector.sourceName,
          displayName: connector.displayName,
          connectorVersion: connector.connectorVersion,
          healthStatus: existing?.healthStatus ?? 'unknown',
          lastSyncAt: existing?.lastSyncAt ?? null,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
          lastFailureAt: existing?.lastFailureAt ?? null,
          lastErrorCode: existing?.lastErrorCode ?? null,
        };
      })
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
  };

  const upsertConnectorState = async (
    sourceName: SourceName,
    next: {
      healthStatus: SourceConnectorHealthStatus;
      lastSyncAt: string;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastErrorCode: string | null;
    },
  ): Promise<void> => {
    const connector = getConnectorOrThrow(sourceName);

    await repository.upsertConnectorState({
      sourceName,
      displayName: connector.displayName,
      connectorVersion: connector.connectorVersion,
      healthStatus: next.healthStatus,
      lastSyncAt: next.lastSyncAt,
      lastSuccessAt: next.lastSuccessAt,
      lastFailureAt: next.lastFailureAt,
      lastErrorCode: next.lastErrorCode,
    });
  };

  const syncConnector = async (
    sourceName: SourceName,
    request: ConnectorSyncRequest,
  ): Promise<Omit<ConnectorSyncResponse, 'contractVersion'>> => {
    const connector = getConnectorOrThrow(sourceName);
    const existingStateByName = await getExistingStateByName();
    const existingState = existingStateByName.get(sourceName) ?? null;

    const startedAt = now().toISOString();

    try {
      const result = await connector.sync(request);
      const errors = result.errors.map(sanitizeSyncError);
      let insertedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const rawCandidate of result.jobs) {
        const parsedCandidate = connectorJobCandidateSchema.safeParse(rawCandidate);
        if (!parsedCandidate.success) {
          const firstIssue = parsedCandidate.error.issues[0];
          if (firstIssue) {
            errors.push(sanitizeSyncError(summarizeValidationIssue(sourceName, firstIssue)));
          } else {
            errors.push(sanitizeSyncError(`${sourceName} invalid candidate payload`));
          }

          continue;
        }

        const upsertResult = await repository.upsertSourceJob({
          sourceName,
          fetchedAt: result.fetchedAt,
          observedAt: startedAt,
          checksumSha256: toChecksumSha256(parsedCandidate.data.rawPayload),
          job: parsedCandidate.data,
        });

        const counters = upsertResultCounts(upsertResult);
        insertedCount += counters.insertedCount;
        updatedCount += counters.updatedCount;
        unchangedCount += counters.unchangedCount;
      }

      const completedAt = now().toISOString();
      const { failedCount, responseErrors } = capSyncErrorsForResponse(errors);
      const healthStatus: SourceConnectorHealthStatus =
        failedCount === 0 ? 'healthy' : 'degraded';

      await upsertConnectorState(sourceName, {
        healthStatus,
        lastSyncAt: completedAt,
        lastSuccessAt: completedAt,
        lastFailureAt: failedCount > 0 ? completedAt : existingState?.lastFailureAt ?? null,
        lastErrorCode: failedCount > 0 ? 'partial_sync_failures' : null,
      });

      return {
        sourceName,
        startedAt,
        completedAt,
        fetchedCount: result.jobs.length,
        insertedCount,
        updatedCount,
        unchangedCount,
        failedCount,
        healthStatus,
        errors: responseErrors,
      };
    } catch (error: unknown) {
      const completedAt = now().toISOString();
      const errorCode = getErrorCode(error);

      await upsertConnectorState(sourceName, {
        healthStatus: 'unhealthy',
        lastSyncAt: completedAt,
        lastSuccessAt: existingState?.lastSuccessAt ?? null,
        lastFailureAt: completedAt,
        lastErrorCode: errorCode,
      });

      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(502, 'source_connector_sync_failed', {
        sourceName,
      });
    }
  };

  const listSourceJobs = async (options?: {
    sourceName?: SourceName;
    limit?: number;
  }): Promise<SourceJobSummary[]> => {
    const limit = options?.limit ?? defaultSourceJobLimit;
    if (limit < 1 || limit > maxSourceJobLimit) {
      throw new HttpError(400, 'invalid_source_job_limit', {
        limit,
        maxSourceJobLimit,
      });
    }

    const sourceName = options?.sourceName;
    if (sourceName) {
      getConnectorOrThrow(sourceName);
    }

    return repository.listSourceJobs({
      sourceName,
      limit,
    });
  };

  const getSourceJob = async (
    sourceName: SourceName,
    sourceJobId: string,
  ): Promise<SourceJobSummary | null> => {
    getConnectorOrThrow(sourceName);

    const sourceJob = await repository.findSourceJob(sourceName, sourceJobId);
    if (!sourceJob) {
      return null;
    }

    return toSourceJobSummary(sourceJob);
  };

  return {
    listConnectors,
    syncConnector,
    getSourceJob,
    listSourceJobs,
  };
};
