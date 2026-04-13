import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createLeverPublicBoardConnector } from '../../src/modules/connectors/lever-public-board-connector.js';
import { leverPublicBoardFixture } from '../fixtures/connectors/lever-public-board.fixture.js';

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

test('lever connector normalizes jobs and reports invalid source records', async () => {
  const connector = createLeverPublicBoardConnector({
    companyHandle: 'acmelabs',
    fetchImpl: createFetchFromPayload(leverPublicBoardFixture),
  });

  const result = await connector.sync({ maxRecords: 10 });

  assert.equal(result.jobs.length, 2);
  assert.equal(result.errors.length, 1);

  const first = result.jobs.find((job) => job.sourceJobId === 'lever-1001');
  assert.ok(first);
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

  const second = result.jobs.find((job) => job.sourceJobId === 'lever-1002');
  assert.ok(second);
  assert.equal(second?.remoteType, 'hybrid');
  assert.equal(second?.employmentType, 'contract');
  assert.ok(second?.normalizedSkills.includes('Python'));
  assert.ok(second?.normalizedSkills.includes('Terraform'));
});

test('lever connector applies maxRecords limit and surfaces fetch failures', async () => {
  const connector = createLeverPublicBoardConnector({
    companyHandle: 'acmelabs',
    fetchImpl: createFetchFromPayload(leverPublicBoardFixture),
  });

  const limited = await connector.sync({ maxRecords: 1 });
  assert.equal(limited.jobs.length, 1);

  const failingConnector = createLeverPublicBoardConnector({
    companyHandle: 'acmelabs',
    fetchImpl: createFetchFromPayload({ message: 'boom' }, 500, 'Internal Server Error'),
  });

  await assert.rejects(
    async () => failingConnector.sync({ maxRecords: 5 }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.code === 'lever_fetch_failed',
  );
});

test('lever connector rejects invalid top-level response shape', async () => {
  const connector = createLeverPublicBoardConnector({
    companyHandle: 'acmelabs',
    fetchImpl: createFetchFromPayload({ postings: [] }),
  });

  await assert.rejects(
    async () => connector.sync({ maxRecords: 10 }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.code === 'lever_invalid_response',
  );
});
