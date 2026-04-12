import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createApiServer } from '../../src/server.js';

const startServer = async (): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> => {
  const server = createApiServer();

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_start_test_server');
  }

  const port = (address as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
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

test('register returns auth session and default profile is readable', async () => {
  const app = await startServer();

  try {
    const registerResponse = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'user1@test.dev' }),
    });

    assert.equal(registerResponse.status, 200);
    const registerBody = (await registerResponse.json()) as {
      contractVersion: string;
      session: { accessToken: string };
    };

    assert.equal(registerBody.contractVersion, 'v1');
    assert.equal(typeof registerBody.session.accessToken, 'string');
    assert.ok(registerBody.session.accessToken.length >= 32);

    const profileResponse = await fetch(`${app.baseUrl}/v1/profile`, {
      headers: {
        authorization: `Bearer ${registerBody.session.accessToken}`,
      },
    });

    assert.equal(profileResponse.status, 200);
    const profileBody = (await profileResponse.json()) as {
      profile: { currentTitle: string | null; userId: string };
    };

    assert.equal(profileBody.profile.currentTitle, null);
    assert.equal(typeof profileBody.profile.userId, 'string');
  } finally {
    await app.close();
  }
});

test('invalid request body and unauthorized request return 4xx errors', async () => {
  const app = await startServer();

  try {
    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    assert.equal(invalidBodyResponse.status, 400);
    const invalidBody = (await invalidBodyResponse.json()) as {
      error: string;
    };
    assert.equal(invalidBody.error, 'invalid_request_body');

    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/profile`);
    assert.equal(unauthorizedResponse.status, 401);

    const unauthorizedBody = (await unauthorizedResponse.json()) as {
      error: string;
    };
    assert.equal(unauthorizedBody.error, 'missing_access_token');
  } finally {
    await app.close();
  }
});

test('preference rule errors and normalization are applied through HTTP routes', async () => {
  const app = await startServer();

  try {
    const registerResponse = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'user2@test.dev' }),
    });

    const registerBody = (await registerResponse.json()) as {
      session: { accessToken: string };
    };

    const accessToken = registerBody.session.accessToken;

    const invalidPreferencesResponse = await fetch(
      `${app.baseUrl}/v1/preferences`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preferredTitles: [],
          preferredIndustries: [],
          preferredSkills: [],
          preferredLocations: [],
          remotePreference: 'remote',
          targetSeniorityMin: null,
          targetSeniorityMax: null,
          salaryMin: 180000,
          salaryTarget: 120000,
          dealBreakers: [],
          hiddenCompanies: [],
          hiddenTitles: [],
          stretchPreferenceLevel: 3,
          notificationPreferences: {
            dailyDigest: true,
            weeklyDigest: false,
            instantHighFit: true,
          },
        }),
      },
    );

    assert.equal(invalidPreferencesResponse.status, 400);
    const invalidPreferencesBody = (await invalidPreferencesResponse.json()) as {
      error: string;
    };
    assert.equal(invalidPreferencesBody.error, 'invalid_salary_range');

    const validPreferencesResponse = await fetch(`${app.baseUrl}/v1/preferences`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        preferredTitles: [' Software Engineer ', 'software engineer', 'Tech Lead'],
        preferredIndustries: ['Software'],
        preferredSkills: ['TypeScript', 'typescript', 'Node.js'],
        preferredLocations: ['Remote'],
        remotePreference: 'remote',
        targetSeniorityMin: 'mid',
        targetSeniorityMax: 'staff',
        salaryMin: 130000,
        salaryTarget: 160000,
        dealBreakers: ['No sponsorship'],
        hiddenCompanies: ['Acme', 'acme'],
        hiddenTitles: ['Intern'],
        stretchPreferenceLevel: 4,
        notificationPreferences: {
          dailyDigest: true,
          weeklyDigest: true,
          instantHighFit: true,
        },
      }),
    });

    assert.equal(validPreferencesResponse.status, 200);
    const validPreferencesBody = (await validPreferencesResponse.json()) as {
      preferences: {
        preferredTitles: string[];
        preferredSkills: string[];
        hiddenCompanies: string[];
      };
    };

    assert.deepEqual(validPreferencesBody.preferences.preferredTitles, [
      'Software Engineer',
      'Tech Lead',
    ]);
    assert.deepEqual(validPreferencesBody.preferences.preferredSkills, [
      'TypeScript',
      'Node.js',
    ]);
    assert.deepEqual(validPreferencesBody.preferences.hiddenCompanies, ['Acme']);
  } finally {
    await app.close();
  }
});
