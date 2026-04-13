import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createGreenhousePublicBoardConnector } from '../../src/modules/connectors/greenhouse-public-board-connector.js';
import { greenhousePublicBoardFixture } from '../fixtures/connectors/greenhouse-public-board.fixture.js';

const createFetchFromPayload = (
  payload: unknown,
  status = 200,
  statusText = 'OK',
): typeof fetch =>
  async () =>
    new Response(JSON.stringify(payload), {
      status,
      statusText,
      headers: {
        'content-type': 'application/json',
      },
    });

test('greenhouse connector normalizes jobs and reports invalid source records', async () => {
  const connector = createGreenhousePublicBoardConnector({
    boardToken: 'acme-labs',
    fetchImpl: createFetchFromPayload(greenhousePublicBoardFixture),
  });

  const result = await connector.sync({ maxRecords: 10 });

  assert.equal(result.jobs.length, 2);
  assert.equal(result.errors.length, 1);

  const first = result.jobs.find((job) => job.sourceJobId === '1001');
  assert.ok(first);
  assert.equal(first?.sourceJobId, '1001');
  assert.equal(first?.remoteType, 'remote');
  assert.equal(first?.employmentType, 'full_time');
  assert.ok(first?.normalizedSkills.includes('TypeScript'));
  assert.ok(first?.requiredSkills.includes('TypeScript'));
  assert.ok(
    first?.preferredSkills.includes('Kubernetes') ||
      first?.requiredSkills.includes('Kubernetes'),
  );
  assert.equal(first?.salaryMin, 180000);
  assert.equal(first?.salaryMax, 220000);
  assert.equal(first?.salaryCurrency, 'USD');
  assert.equal(first?.salaryPeriod, 'year');

  const second = result.jobs.find((job) => job.sourceJobId === '1002');
  assert.ok(second);
  assert.equal(second?.sourceJobId, '1002');
  assert.equal(second?.remoteType, 'hybrid');
  assert.equal(second?.employmentType, 'unknown');
  assert.ok(second?.normalizedSkills.includes('Python'));
  assert.ok(second?.normalizedSkills.includes('Terraform'));
});

test('greenhouse connector applies maxRecords limit and surfaces fetch failures', async () => {
  const connector = createGreenhousePublicBoardConnector({
    boardToken: 'acme-labs',
    fetchImpl: createFetchFromPayload(greenhousePublicBoardFixture),
  });

  const limited = await connector.sync({ maxRecords: 1 });
  assert.equal(limited.jobs.length, 1);

  const failingConnector = createGreenhousePublicBoardConnector({
    boardToken: 'acme-labs',
    fetchImpl: createFetchFromPayload({ message: 'boom' }, 500, 'Internal Server Error'),
  });

  await assert.rejects(
    async () => failingConnector.sync({ maxRecords: 5 }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.code === 'greenhouse_fetch_failed',
  );
});

test('greenhouse connector accepts null metadata payloads', async () => {
  const payload = {
    jobs: [
      {
        id: 3001,
        title: 'Backend Platform Engineer',
        absolute_url: 'https://boards.greenhouse.io/acmelabs/jobs/3001',
        updated_at: '2026-04-12T12:00:00.000Z',
        content: '<p>TypeScript and Node.js services</p>',
        location: {
          name: 'Remote',
        },
        metadata: null,
      },
    ],
  };

  const connector = createGreenhousePublicBoardConnector({
    boardToken: 'acme-labs',
    fetchImpl: createFetchFromPayload(payload),
  });

  const result = await connector.sync({ maxRecords: 10 });

  assert.equal(result.errors.length, 0);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0]?.sourceJobId, '3001');
});
