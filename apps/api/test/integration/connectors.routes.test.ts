import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createInMemoryConnectorRepository } from '../../src/modules/connectors/in-memory-repository.js';
import { createConnectorService } from '../../src/modules/connectors/service.js';
import type {
  ConnectorJobCandidate,
  SourceConnectorDefinition,
} from '../../src/modules/connectors/types.js';
import { createApiServer, type CreateApiServerOptions } from '../../src/server.js';

const startServer = async (
  options?: CreateApiServerOptions,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> => {
  const server = createApiServer(options);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_start_test_server');
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const registerAndGetAccessToken = async (baseUrl: string): Promise<string> => {
  const uniqueId = Math.random().toString(36).slice(2, 10);

  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `connectors.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

const createCandidate = (sourceJobId: string): ConnectorJobCandidate => ({
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
  descriptionText: 'TypeScript role with Node.js and AWS',
  normalizedSkills: ['TypeScript', 'Node.js', 'AWS'],
  requiredSkills: ['TypeScript', 'Node.js'],
  preferredSkills: ['AWS'],
  salaryMin: 170000,
  salaryMax: 210000,
  salaryCurrency: 'USD',
  salaryPeriod: 'year',
  rawPayload: {
    id: sourceJobId,
  },
});

const createLeverCandidate = (sourceJobId: string): ConnectorJobCandidate => ({
  sourceJobId,
  sourceCompanyId: 'acme-lever',
  sourceStatus: 'open',
  title: 'Senior Platform Engineer',
  companyName: 'Acme Lever',
  fetchUrl: `https://jobs.lever.co/acme/${sourceJobId}`,
  applicationUrl: `https://jobs.lever.co/acme/${sourceJobId}/apply`,
  locationText: 'Remote - United States',
  remoteType: 'remote',
  employmentType: 'full_time',
  postedAt: '2026-04-12T00:00:00.000Z',
  descriptionText: 'TypeScript and platform role',
  normalizedSkills: ['TypeScript', 'Kubernetes'],
  requiredSkills: ['TypeScript'],
  preferredSkills: ['Kubernetes'],
  salaryMin: 180000,
  salaryMax: 220000,
  salaryCurrency: 'USD',
  salaryPeriod: 'year',
  rawPayload: {
    id: sourceJobId,
  },
});

const createTestConnectorService = () => {
  const greenhouseCandidates = [createCandidate('1001'), createCandidate('1002')];
  const leverCandidates = [
    createLeverCandidate('lever-1001'),
    createLeverCandidate('lever-1002'),
  ];

  const greenhouseConnector: SourceConnectorDefinition = {
    sourceName: 'greenhouse_public_board',
    displayName: 'Greenhouse Public Board',
    connectorVersion: 'greenhouse-public-board-v1',
    async sync(input) {
      const maxRecords = input.maxRecords ?? greenhouseCandidates.length;
      return {
        fetchedAt: '2026-04-12T00:00:00.000Z',
        jobs: greenhouseCandidates.slice(0, maxRecords),
        errors: [],
      };
    },
  };

  const leverConnector: SourceConnectorDefinition = {
    sourceName: 'lever_public_board',
    displayName: 'Lever Public Board',
    connectorVersion: 'lever-public-board-v1',
    async sync(input) {
      const maxRecords = input.maxRecords ?? leverCandidates.length;
      return {
        fetchedAt: '2026-04-12T00:00:00.000Z',
        jobs: leverCandidates.slice(0, maxRecords),
        errors: [],
      };
    },
  };

  return createConnectorService({
    repository: createInMemoryConnectorRepository(),
    connectors: [greenhouseConnector, leverConnector],
    now: () => new Date('2026-04-12T12:00:00.000Z'),
  });
};

test('connector routes sync and list source jobs with authenticated access', async () => {
  const app = await startServer({
    connectorService: createTestConnectorService(),
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/connectors`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const connectorsBefore = await fetch(`${app.baseUrl}/v1/connectors`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(connectorsBefore.status, 200);
    const beforeBody = (await connectorsBefore.json()) as {
      contractVersion: string;
      connectors: Array<{ sourceName: string; healthStatus: string }>;
    };

    assert.equal(beforeBody.contractVersion, 'v1');
    assert.equal(beforeBody.connectors.length, 2);
    assert.ok(
      beforeBody.connectors.some(
        (connector) =>
          connector.sourceName === 'greenhouse_public_board' &&
          connector.healthStatus === 'unknown',
      ),
    );
    assert.ok(
      beforeBody.connectors.some(
        (connector) =>
          connector.sourceName === 'lever_public_board' &&
          connector.healthStatus === 'unknown',
      ),
    );

    const syncResponse = await fetch(
      `${app.baseUrl}/v1/connectors/greenhouse_public_board/sync`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          maxRecords: 1,
        }),
      },
    );

    assert.equal(syncResponse.status, 200);
    const syncBody = (await syncResponse.json()) as {
      insertedCount: number;
      updatedCount: number;
      unchangedCount: number;
      failedCount: number;
      healthStatus: string;
    };

    assert.equal(syncBody.insertedCount, 1);
    assert.equal(syncBody.updatedCount, 0);
    assert.equal(syncBody.unchangedCount, 0);
    assert.equal(syncBody.failedCount, 0);
    assert.equal(syncBody.healthStatus, 'healthy');

    const leverSyncResponse = await fetch(
      `${app.baseUrl}/v1/connectors/lever_public_board/sync`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          maxRecords: 1,
        }),
      },
    );

    assert.equal(leverSyncResponse.status, 200);
    const leverSyncBody = (await leverSyncResponse.json()) as {
      insertedCount: number;
      failedCount: number;
      healthStatus: string;
      sourceName: string;
    };

    assert.equal(leverSyncBody.sourceName, 'lever_public_board');
    assert.equal(leverSyncBody.insertedCount, 1);
    assert.equal(leverSyncBody.failedCount, 0);
    assert.equal(leverSyncBody.healthStatus, 'healthy');

    const sourceJobsResponse = await fetch(
      `${app.baseUrl}/v1/source-jobs?sourceName=greenhouse_public_board&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(sourceJobsResponse.status, 200);
    const sourceJobsBody = (await sourceJobsResponse.json()) as {
      contractVersion: string;
      sourceJobs: Array<{ sourceJobId: string }>;
    };

    assert.equal(sourceJobsBody.contractVersion, 'v1');
    assert.equal(sourceJobsBody.sourceJobs.length, 1);
    assert.equal(sourceJobsBody.sourceJobs[0]?.sourceJobId, '1001');

    const leverSourceJobsResponse = await fetch(
      `${app.baseUrl}/v1/source-jobs?sourceName=lever_public_board&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(leverSourceJobsResponse.status, 200);
    const leverSourceJobsBody = (await leverSourceJobsResponse.json()) as {
      sourceJobs: Array<{ sourceJobId: string }>;
    };

    assert.equal(leverSourceJobsBody.sourceJobs.length, 1);
    assert.equal(leverSourceJobsBody.sourceJobs[0]?.sourceJobId, 'lever-1001');
  } finally {
    await app.close();
  }
});

test('connector routes validate source name and query limit', async () => {
  const app = await startServer({
    connectorService: createTestConnectorService(),
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidSourceSync = await fetch(`${app.baseUrl}/v1/connectors/INVALID/sync`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(invalidSourceSync.status, 400);

    const invalidLimit = await fetch(
      `${app.baseUrl}/v1/source-jobs?limit=not-a-number`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(invalidLimit.status, 400);
    const invalidLimitBody = (await invalidLimit.json()) as { error: string };
    assert.equal(invalidLimitBody.error, 'invalid_source_job_limit');
  } finally {
    await app.close();
  }
});
