import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createArbeitnowJobBoardConnector } from '../../src/modules/connectors/arbeitnow-job-board-connector.js';
import {
  arbeitnowJobBoardFixturePageOne,
  arbeitnowJobBoardFixturePageTwo,
} from '../fixtures/connectors/arbeitnow-job-board.fixture.js';

const createPaginatedFetch = (
  pageMap: Record<string, unknown>,
  status = 200,
  statusText = 'OK',
): typeof fetch =>
  async (input) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? new URL(input.toString())
          : new URL(input.url);
    const key = `${url.pathname}${url.search}`;

    const payload = pageMap[key];
    if (payload === undefined) {
      return new Response(JSON.stringify({ message: 'not_found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify(payload), {
      status,
      statusText,
      headers: {
        'content-type': 'application/json',
      },
    });
  };

test('arbeitnow connector normalizes jobs and reports invalid source records', async () => {
  const connector = createArbeitnowJobBoardConnector({
    endpointBaseUrl: 'https://www.arbeitnow.com/api/job-board-api?limit=3',
    fetchImpl: createPaginatedFetch({
      '/api/job-board-api?limit=3': arbeitnowJobBoardFixturePageOne,
      '/api/job-board-api?page=2&limit=3': arbeitnowJobBoardFixturePageTwo,
    }),
  });

  const result = await connector.sync({ maxRecords: 10 });

  assert.equal(result.jobs.length, 3);
  assert.equal(result.errors.length, 1);

  const first = result.jobs.find((job) => job.sourceJobId === 'senior-platform-engineer-remote-1001');
  assert.ok(first);
  assert.equal(first?.remoteType, 'remote');
  assert.equal(first?.employmentType, 'full_time');
  assert.ok(first?.normalizedSkills.includes('TypeScript'));
  assert.ok(first?.requiredSkills.includes('TypeScript'));
  assert.ok(
    first?.preferredSkills.includes('Kubernetes') ||
      first?.requiredSkills.includes('Kubernetes'),
  );

  const second = result.jobs.find((job) => job.sourceJobId === 'data-engineer-hybrid-1002');
  assert.ok(second);
  assert.equal(second?.remoteType, 'hybrid');
  assert.equal(second?.employmentType, 'contract');
  assert.ok(second?.normalizedSkills.includes('Python'));
  assert.ok(second?.normalizedSkills.includes('Terraform'));

  const third = result.jobs.find((job) => job.sourceJobId === 'backend-engineer-onsite-1003');
  assert.ok(third);
  assert.equal(third?.remoteType, 'onsite');
});

test('arbeitnow connector applies maxRecords limit and surfaces fetch failures', async () => {
  const connector = createArbeitnowJobBoardConnector({
    endpointBaseUrl: 'https://www.arbeitnow.com/api/job-board-api?limit=3',
    fetchImpl: createPaginatedFetch({
      '/api/job-board-api?limit=3': arbeitnowJobBoardFixturePageOne,
      '/api/job-board-api?page=2&limit=3': arbeitnowJobBoardFixturePageTwo,
    }),
  });

  const limited = await connector.sync({ maxRecords: 1 });
  assert.equal(limited.jobs.length, 1);

  const failingConnector = createArbeitnowJobBoardConnector({
    endpointBaseUrl: 'https://www.arbeitnow.com/api/job-board-api?limit=3',
    fetchImpl: createPaginatedFetch(
      {
        '/api/job-board-api?limit=3': { message: 'boom' },
      },
      500,
      'Internal Server Error',
    ),
  });

  await assert.rejects(
    async () => failingConnector.sync({ maxRecords: 5 }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.code === 'arbeitnow_fetch_failed',
  );
});

test('arbeitnow connector rejects invalid top-level response shape', async () => {
  const connector = createArbeitnowJobBoardConnector({
    endpointBaseUrl: 'https://www.arbeitnow.com/api/job-board-api?limit=3',
    fetchImpl: createPaginatedFetch({
      '/api/job-board-api?limit=3': { postings: [] },
    }),
  });

  await assert.rejects(
    async () => connector.sync({ maxRecords: 10 }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.code === 'arbeitnow_invalid_response',
  );
});
