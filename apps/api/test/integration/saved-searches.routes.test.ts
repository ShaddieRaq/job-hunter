import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

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
      email: `saved.searches.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('saved-search routes create/list/get/delete for authenticated users', async () => {
  const app = await startServer();

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const createResponse = await fetch(`${app.baseUrl}/v1/saved-searches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Backend remote apply set',
        query: {
          q: 'backend distributed systems',
          recommendation: 'high_fit',
          remote: 'aligned',
          source: 'any',
          sort: 'fit',
          includeHidden: false,
        },
      }),
    });

    assert.equal(createResponse.status, 200);
    const createBody = (await createResponse.json()) as {
      contractVersion: string;
      savedSearch: {
        savedSearchId: string;
        name: string;
        query: { source: string };
      };
    };

    assert.equal(createBody.contractVersion, 'v1');
    assert.equal(createBody.savedSearch.name, 'Backend remote apply set');
    assert.equal(createBody.savedSearch.query.source, 'any');

    const listResponse = await fetch(`${app.baseUrl}/v1/saved-searches?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      savedSearches: Array<{ savedSearchId: string }>;
    };

    assert.equal(listBody.savedSearches.length, 1);
    assert.equal(listBody.savedSearches[0]?.savedSearchId, createBody.savedSearch.savedSearchId);

    const detailResponse = await fetch(
      `${app.baseUrl}/v1/saved-searches/${createBody.savedSearch.savedSearchId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(detailResponse.status, 200);

    const deleteResponse = await fetch(
      `${app.baseUrl}/v1/saved-searches/${createBody.savedSearch.savedSearchId}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(deleteResponse.status, 200);
    const deleteBody = (await deleteResponse.json()) as {
      deletedSavedSearchId: string;
    };

    assert.equal(deleteBody.deletedSavedSearchId, createBody.savedSearch.savedSearchId);

    const afterDeleteResponse = await fetch(`${app.baseUrl}/v1/saved-searches?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(afterDeleteResponse.status, 200);
    const afterDeleteBody = (await afterDeleteResponse.json()) as {
      savedSearches: unknown[];
    };

    assert.equal(afterDeleteBody.savedSearches.length, 0);
  } finally {
    await app.close();
  }
});

test('saved-search routes enforce auth and validation constraints', async () => {
  const app = await startServer();

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/saved-searches`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidLimitResponse = await fetch(`${app.baseUrl}/v1/saved-searches?limit=oops`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidLimitResponse.status, 400);

    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/saved-searches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: '',
        query: {
          q: '',
          recommendation: 'high_fit',
          remote: 'aligned',
          source: 'any',
          sort: 'fit',
          includeHidden: false,
        },
      }),
    });

    assert.equal(invalidBodyResponse.status, 400);

    const firstCreateResponse = await fetch(`${app.baseUrl}/v1/saved-searches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Duplicate test',
        query: {
          q: 'backend',
          recommendation: 'all',
          remote: 'any',
          source: 'greenhouse_public_board',
          sort: 'recent',
          includeHidden: false,
        },
      }),
    });

    assert.equal(firstCreateResponse.status, 200);

    const duplicateCreateResponse = await fetch(`${app.baseUrl}/v1/saved-searches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: '  duplicate test ',
        query: {
          q: 'backend',
          recommendation: 'apply',
          remote: 'remote',
          source: 'lever_public_board',
          sort: 'fit',
          includeHidden: true,
        },
      }),
    });

    assert.equal(duplicateCreateResponse.status, 409);

    const invalidIdResponse = await fetch(`${app.baseUrl}/v1/saved-searches/not-a-uuid`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidIdResponse.status, 400);

    const unknownId = '5c9ed004-6fe2-41ab-a3f8-cf1ecdc5291c';

    const missingDetailResponse = await fetch(
      `${app.baseUrl}/v1/saved-searches/${unknownId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(missingDetailResponse.status, 404);

    const missingDeleteResponse = await fetch(
      `${app.baseUrl}/v1/saved-searches/${unknownId}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(missingDeleteResponse.status, 404);
  } finally {
    await app.close();
  }
});
