import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createInMemoryConnectorRepository } from '../../src/modules/connectors/in-memory-repository.js';
import { createConnectorService } from '../../src/modules/connectors/service.js';
import type {
  ConnectorJobCandidate,
  SourceConnectorDefinition,
} from '../../src/modules/connectors/types.js';

const buildCandidate = (
  sourceJobId: string,
  rawRevision: number,
): ConnectorJobCandidate => ({
  sourceJobId,
  sourceCompanyId: 'acme-labs',
  sourceStatus: 'open',
  title: 'Senior Backend Engineer',
  companyName: 'Acme Labs',
  fetchUrl: `https://boards.greenhouse.io/acmelabs/jobs/${sourceJobId}`,
  applicationUrl: `https://boards.greenhouse.io/acmelabs/jobs/${sourceJobId}`,
  locationText: 'Remote - United States',
  remoteType: 'remote',
  employmentType: 'full_time',
  postedAt: '2026-04-12T00:00:00.000Z',
  descriptionText: 'TypeScript and Node.js role',
  normalizedSkills: ['TypeScript', 'Node.js'],
  requiredSkills: ['TypeScript'],
  preferredSkills: ['Node.js'],
  salaryMin: 170000,
  salaryMax: 210000,
  salaryCurrency: 'USD',
  salaryPeriod: 'year',
  rawPayload: {
    id: sourceJobId,
    revision: rawRevision,
  },
});

const createMutableConnector = (): {
  connector: SourceConnectorDefinition;
  setCandidates: (nextCandidates: ConnectorJobCandidate[]) => void;
  setErrors: (nextErrors: string[]) => void;
} => {
  let candidates: ConnectorJobCandidate[] = [buildCandidate('1001', 1)];
  let errors: string[] = [];

  return {
    connector: {
      sourceName: 'greenhouse_public_board',
      displayName: 'Greenhouse Public Board',
      connectorVersion: 'greenhouse-public-board-v1',
      async sync() {
        return {
          fetchedAt: '2026-04-12T00:00:00.000Z',
          jobs: candidates,
          errors,
        };
      },
    },
    setCandidates(nextCandidates) {
      candidates = nextCandidates;
    },
    setErrors(nextErrors) {
      errors = nextErrors;
    },
  };
};

test('connector service sync is idempotent and reports inserted/updated/unchanged counts', async () => {
  const repository = createInMemoryConnectorRepository();
  const mutable = createMutableConnector();

  const service = createConnectorService({
    repository,
    connectors: [mutable.connector],
    now: () => new Date('2026-04-12T10:00:00.000Z'),
  });

  const beforeSync = await service.listConnectors();
  assert.equal(beforeSync.length, 1);
  assert.equal(beforeSync[0]?.healthStatus, 'unknown');

  const firstSync = await service.syncConnector('greenhouse_public_board', {
    maxRecords: 10,
  });
  assert.equal(firstSync.insertedCount, 1);
  assert.equal(firstSync.updatedCount, 0);
  assert.equal(firstSync.unchangedCount, 0);
  assert.equal(firstSync.failedCount, 0);
  assert.equal(firstSync.healthStatus, 'healthy');

  const secondSync = await service.syncConnector('greenhouse_public_board', {
    maxRecords: 10,
  });
  assert.equal(secondSync.insertedCount, 0);
  assert.equal(secondSync.updatedCount, 0);
  assert.equal(secondSync.unchangedCount, 1);
  assert.equal(secondSync.failedCount, 0);

  mutable.setCandidates([buildCandidate('1001', 2)]);
  const thirdSync = await service.syncConnector('greenhouse_public_board', {
    maxRecords: 10,
  });
  assert.equal(thirdSync.insertedCount, 0);
  assert.equal(thirdSync.updatedCount, 1);
  assert.equal(thirdSync.unchangedCount, 0);

  const sourceJobs = await service.listSourceJobs({
    sourceName: 'greenhouse_public_board',
    limit: 20,
  });
  assert.equal(sourceJobs.length, 1);
  assert.equal(sourceJobs[0]?.sourceJobId, '1001');
});

test('connector service marks sync as degraded when connector reports errors', async () => {
  const repository = createInMemoryConnectorRepository();
  const mutable = createMutableConnector();
  mutable.setErrors(['job[4] missing id']);

  const service = createConnectorService({
    repository,
    connectors: [mutable.connector],
    now: () => new Date('2026-04-12T11:00:00.000Z'),
  });

  const result = await service.syncConnector('greenhouse_public_board', {
    maxRecords: 10,
  });

  assert.equal(result.failedCount, 1);
  assert.equal(result.healthStatus, 'degraded');

  const connectors = await service.listConnectors();
  assert.equal(connectors[0]?.healthStatus, 'degraded');
  assert.equal(connectors[0]?.lastErrorCode, 'partial_sync_failures');
});

test('connector service returns not found for unknown source', async () => {
  const service = createConnectorService({
    connectors: [],
  });

  await assert.rejects(
    async () => service.syncConnector('greenhouse_public_board', {}),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 404 &&
      error.code === 'source_connector_not_found',
  );
});
