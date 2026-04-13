import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createInMemoryCanonicalJobRepository } from '../../src/modules/canonical-jobs/in-memory-repository.js';
import { createCanonicalJobsService } from '../../src/modules/canonical-jobs/service.js';
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
      email: `canonical.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

const createCandidate = (sourceJobId: string, title: string): ConnectorJobCandidate => ({
  sourceJobId,
  sourceCompanyId: 'acme-labs',
  sourceStatus: 'open',
  title,
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

const createServices = () => {
  const candidates = [
    createCandidate('4001', 'Senior Backend Engineer'),
    createCandidate('4002', 'Sr Backend Engineer'),
  ];

  const connector: SourceConnectorDefinition = {
    sourceName: 'greenhouse_public_board',
    displayName: 'Greenhouse Public Board',
    connectorVersion: 'greenhouse-public-board-v1',
    async sync() {
      return {
        fetchedAt: '2026-04-12T00:00:00.000Z',
        jobs: candidates,
        errors: [],
      };
    },
  };

  const connectorService = createConnectorService({
    repository: createInMemoryConnectorRepository(),
    connectors: [connector],
    now: () => new Date('2026-04-12T12:00:00.000Z'),
  });

  const canonicalJobsService = createCanonicalJobsService({
    sourceJobReader: connectorService,
    repository: createInMemoryCanonicalJobRepository(),
    now: () => new Date('2026-04-12T12:05:00.000Z'),
  });

  return {
    connectorService,
    canonicalJobsService,
  };
};

test('canonical routes rebuild and return canonical detail view', async () => {
  const services = createServices();

  const app = await startServer({
    connectorService: services.connectorService,
    canonicalJobsService: services.canonicalJobsService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const syncResponse = await fetch(
      `${app.baseUrl}/v1/connectors/greenhouse_public_board/sync`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          maxRecords: 10,
        }),
      },
    );

    assert.equal(syncResponse.status, 200);

    const rebuildResponse = await fetch(`${app.baseUrl}/v1/canonical-jobs/rebuild`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        maxSourceJobs: 100,
      }),
    });

    assert.equal(rebuildResponse.status, 200);
    const rebuildBody = (await rebuildResponse.json()) as {
      contractVersion: string;
      sourceJobsScanned: number;
      canonicalJobsCreated: number;
      dedupedSourceJobs: number;
    };

    assert.equal(rebuildBody.contractVersion, 'v1');
    assert.equal(rebuildBody.sourceJobsScanned, 2);
    assert.equal(rebuildBody.canonicalJobsCreated, 1);
    assert.equal(rebuildBody.dedupedSourceJobs, 1);

    const listResponse = await fetch(`${app.baseUrl}/v1/canonical-jobs?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      contractVersion: string;
      jobs: Array<{ canonicalJobId: string; sourceCount: number }>;
    };

    assert.equal(listBody.contractVersion, 'v1');
    assert.equal(listBody.jobs.length, 1);
    assert.equal(listBody.jobs[0]?.sourceCount, 2);

    const canonicalJobId = listBody.jobs[0]?.canonicalJobId;
    assert.ok(canonicalJobId);

    const detailResponse = await fetch(
      `${app.baseUrl}/v1/canonical-jobs/${canonicalJobId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(detailResponse.status, 200);
    const detailBody = (await detailResponse.json()) as {
      canonical: { sourceMappings: Array<{ sourceJobId: string }> };
    };

    assert.equal(detailBody.canonical.sourceMappings.length, 2);

    const feedResponse = await fetch(`${app.baseUrl}/v1/feed?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(feedResponse.status, 200);
    const feedBody = (await feedResponse.json()) as {
      contractVersion: string;
      items: Array<{
        job: { canonicalJobId: string };
        latestScoreArtifact: unknown;
        nextAction: { action: string; title: string; rationale: string };
      }>;
    };

    assert.equal(feedBody.contractVersion, 'v1');
    assert.equal(feedBody.items.length, 1);
    assert.equal(feedBody.items[0]?.job.canonicalJobId, canonicalJobId);
    assert.equal(feedBody.items[0]?.latestScoreArtifact, null);
    assert.equal(feedBody.items[0]?.nextAction.action, 'shortlist');

    const unscoredFeedResponse = await fetch(
      `${app.baseUrl}/v1/feed?limit=10&recommendation=unscored`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(unscoredFeedResponse.status, 200);
    const unscoredFeedBody = (await unscoredFeedResponse.json()) as {
      items: Array<{ job: { canonicalJobId: string } }>;
    };

    assert.equal(unscoredFeedBody.items.length, 1);
    assert.equal(unscoredFeedBody.items[0]?.job.canonicalJobId, canonicalJobId);

    const highFitFeedResponse = await fetch(
      `${app.baseUrl}/v1/feed?limit=10&recommendation=high_fit`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(highFitFeedResponse.status, 200);
    const highFitFeedBody = (await highFitFeedResponse.json()) as {
      items: unknown[];
    };

    assert.equal(highFitFeedBody.items.length, 0);

    const sourceFilteredResponse = await fetch(
      `${app.baseUrl}/v1/feed?limit=10&source=greenhouse_public_board`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(sourceFilteredResponse.status, 200);
    const sourceFilteredBody = (await sourceFilteredResponse.json()) as {
      items: Array<{ job: { canonicalJobId: string } }>;
    };

    assert.equal(sourceFilteredBody.items.length, 1);
    assert.equal(sourceFilteredBody.items[0]?.job.canonicalJobId, canonicalJobId);

    const missingSourceResponse = await fetch(
      `${app.baseUrl}/v1/feed?limit=10&source=lever_public_board`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(missingSourceResponse.status, 200);
    const missingSourceBody = (await missingSourceResponse.json()) as {
      items: unknown[];
    };

    assert.equal(missingSourceBody.items.length, 0);

    const feedDetailResponse = await fetch(`${app.baseUrl}/v1/feed/${canonicalJobId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(feedDetailResponse.status, 200);
    const feedDetailBody = (await feedDetailResponse.json()) as {
      canonical: { sourceMappings: Array<{ sourceJobId: string }> };
      latestScoreArtifact: unknown;
      dedupeEvents: Array<{ eventType: string }>;
      sourceJobs: Array<{
        sourceName: string;
        sourceJobId: string;
        fetchUrl: string;
        applicationUrl: string | null;
        requiredSkills: string[];
        preferredSkills: string[];
      }>;
      nextAction: { action: string; title: string; rationale: string };
    };

    assert.equal(feedDetailBody.canonical.sourceMappings.length, 2);
    assert.equal(feedDetailBody.latestScoreArtifact, null);
    assert.equal(feedDetailBody.nextAction.action, 'shortlist');
    assert.equal(feedDetailBody.sourceJobs.length, 2);
    assert.equal(
      feedDetailBody.sourceJobs.every((sourceJob) => sourceJob.fetchUrl.startsWith('https://')),
      true,
    );
    assert.equal(
      feedDetailBody.sourceJobs.every(
        (sourceJob) =>
          sourceJob.requiredSkills.length >= 1 && sourceJob.preferredSkills.length >= 1,
      ),
      true,
    );
    assert.ok(
      feedDetailBody.dedupeEvents.some(
        (event) => event.eventType === 'linked_to_canonical',
      ),
    );

    const dedupeEventsResponse = await fetch(
      `${app.baseUrl}/v1/canonical-jobs/${canonicalJobId}/dedupe-events`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(dedupeEventsResponse.status, 200);
    const dedupeEventsBody = (await dedupeEventsResponse.json()) as {
      canonicalJobId: string;
      events: Array<{ eventType: string }>;
    };

    assert.equal(dedupeEventsBody.canonicalJobId, canonicalJobId);
    assert.equal(dedupeEventsBody.events.length, 2);
  } finally {
    await app.close();
  }
});

test('canonical routes enforce auth and validate request params', async () => {
  const services = createServices();

  const app = await startServer({
    connectorService: services.connectorService,
    canonicalJobsService: services.canonicalJobsService,
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/canonical-jobs`);
    assert.equal(unauthorizedResponse.status, 401);

    const unauthorizedFeed = await fetch(`${app.baseUrl}/v1/feed`);
    assert.equal(unauthorizedFeed.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidLimit = await fetch(`${app.baseUrl}/v1/canonical-jobs?limit=oops`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidLimit.status, 400);

    const invalidId = await fetch(`${app.baseUrl}/v1/canonical-jobs/not-a-uuid`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidId.status, 400);

    const invalidFeedId = await fetch(`${app.baseUrl}/v1/feed/not-a-uuid`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidFeedId.status, 400);
  } finally {
    await app.close();
  }
});
