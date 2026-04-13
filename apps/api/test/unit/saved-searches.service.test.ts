import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createSavedSearchService } from '../../src/modules/saved-searches/service.js';

test('createSavedSearch stores normalized query and list returns newest first', async () => {
  let nowCursor = Date.parse('2026-04-13T09:00:00.000Z');
  const service = createSavedSearchService({
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const userId = 'a8af05a8-1b43-425d-913f-917f39cba4f6';

  const first = await service.createSavedSearch(userId, {
    name: ' Platform lead pipeline ',
    query: {
      q: '  platform distributed systems  ',
      recommendation: 'high_fit',
      remote: 'aligned',
      sort: 'fit',
      includeHidden: false,
    },
  });

  const second = await service.createSavedSearch(userId, {
    name: 'Staff backend hotspots',
    query: {
      q: 'staff backend',
      recommendation: 'apply',
      remote: 'remote',
      sort: 'recent',
      includeHidden: true,
    },
  });

  assert.equal(first.name, 'Platform lead pipeline');
  assert.equal(first.query.q, 'platform distributed systems');

  const listed = await service.listSavedSearches({ userId, limit: 10 });

  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.savedSearchId, second.savedSearchId);
  assert.equal(listed[1]?.savedSearchId, first.savedSearchId);
});

test('createSavedSearch rejects duplicate names per user', async () => {
  const service = createSavedSearchService();
  const userId = '6c4f2c8f-65bd-4d3e-a3e4-e7f9f66800b2';

  await service.createSavedSearch(userId, {
    name: 'Best remote leads',
    query: {
      q: 'remote',
      recommendation: 'high_fit',
      remote: 'remote',
      sort: 'fit',
      includeHidden: false,
    },
  });

  await assert.rejects(
    async () =>
      service.createSavedSearch(userId, {
        name: '  best remote leads  ',
        query: {
          q: 'remote',
          recommendation: 'all',
          remote: 'any',
          sort: 'recent',
          includeHidden: false,
        },
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === 'saved_search_name_exists',
  );
});

test('deleteSavedSearch removes record and throws not found on repeated delete', async () => {
  const service = createSavedSearchService();
  const userId = 'f6f28cde-c53a-47c1-b74f-ffd94ed4ece8';

  const created = await service.createSavedSearch(userId, {
    name: 'Fast apply set',
    query: {
      q: '',
      recommendation: 'apply',
      remote: 'any',
      sort: 'fit',
      includeHidden: false,
    },
  });

  await service.deleteSavedSearch(userId, created.savedSearchId);

  const afterDelete = await service.getSavedSearch(userId, created.savedSearchId);
  assert.equal(afterDelete, null);

  await assert.rejects(
    async () => service.deleteSavedSearch(userId, created.savedSearchId),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 404 &&
      error.code === 'saved_search_not_found',
  );
});
