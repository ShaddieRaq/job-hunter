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

const registerAndGetAccessToken = async (baseUrl: string): Promise<string> => {
  const uniqueId = Math.random().toString(36).slice(2, 10);

  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `resume.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    session: { accessToken: string };
  };
  return body.session.accessToken;
};

test('resume upload, list, and detail routes return v1 payloads', async () => {
  const app = await startServer();

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const content = [
      'Senior Software Engineer',
      'Experience: Senior Software Engineer at Acme Corp',
      'Skills: TypeScript, Node.js, AWS',
      'Education: Bachelor of Science in Software Engineering',
    ].join('\n');

    const uploadResponse = await fetch(`${app.baseUrl}/v1/resumes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        originalFilename: 'resume.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from(content, 'utf8').toString('base64'),
      }),
    });

    assert.equal(uploadResponse.status, 200);
    const uploadBody = (await uploadResponse.json()) as {
      contractVersion: string;
      resume: { resumeId: string; parseStatus: string };
      structuredProfile: { normalizedSkills: string[] } | null;
    };

    assert.equal(uploadBody.contractVersion, 'v1');
    assert.equal(uploadBody.resume.parseStatus, 'parsed');
    assert.ok(uploadBody.structuredProfile);
    assert.ok(uploadBody.structuredProfile?.normalizedSkills.includes('TypeScript'));

    const listResponse = await fetch(`${app.baseUrl}/v1/resumes`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      contractVersion: string;
      resumes: Array<{ resumeId: string; originalFilename: string }>;
    };

    assert.equal(listBody.contractVersion, 'v1');
    assert.equal(listBody.resumes.length, 1);
    assert.equal(listBody.resumes[0]?.originalFilename, 'resume.txt');

    const detailsResponse = await fetch(
      `${app.baseUrl}/v1/resumes/${uploadBody.resume.resumeId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(detailsResponse.status, 200);
    const detailsBody = (await detailsResponse.json()) as {
      contractVersion: string;
      resume: { resumeId: string };
      structuredProfile: { normalizedSkills: string[] } | null;
    };

    assert.equal(detailsBody.contractVersion, 'v1');
    assert.equal(detailsBody.resume.resumeId, uploadBody.resume.resumeId);
    assert.ok(detailsBody.structuredProfile);
    assert.ok(detailsBody.structuredProfile?.normalizedSkills.includes('Node.js'));
  } finally {
    await app.close();
  }
});

test('resume routes return 4xx for missing auth and invalid body', async () => {
  const app = await startServer();

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/resumes`);
    assert.equal(unauthorizedResponse.status, 401);
    const unauthorizedBody = (await unauthorizedResponse.json()) as {
      error: string;
    };
    assert.equal(unauthorizedBody.error, 'missing_access_token');

    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/resumes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        originalFilename: '',
        contentType: 'text/plain',
        contentBase64: '***not-base64***',
      }),
    });

    assert.equal(invalidBodyResponse.status, 400);
    const invalidBody = (await invalidBodyResponse.json()) as {
      error: string;
    };
    assert.equal(invalidBody.error, 'invalid_request_body');
  } finally {
    await app.close();
  }
});

test('resume upload handles unsupported format but stores metadata', async () => {
  const app = await startServer();

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const uploadResponse = await fetch(`${app.baseUrl}/v1/resumes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        originalFilename: 'resume.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 fake-pdf-content', 'utf8').toString(
          'base64',
        ),
      }),
    });

    assert.equal(uploadResponse.status, 200);
    const uploadBody = (await uploadResponse.json()) as {
      resume: { parseStatus: string };
      structuredProfile: unknown;
    };

    assert.equal(uploadBody.resume.parseStatus, 'unsupported_format');
    assert.equal(uploadBody.structuredProfile, null);
  } finally {
    await app.close();
  }
});