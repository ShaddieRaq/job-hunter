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
      email: `ai.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('ai routes return contract-valid extraction and explanations', async () => {
  const app = await startServer();

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const resumeExtractionResponse = await fetch(
      `${app.baseUrl}/v1/ai/extract/resume`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          rawText:
            'Senior Software Engineer with 8 years experience in fintech. Skills include TypeScript and AWS. Open to remote roles.',
        }),
      },
    );

    assert.equal(resumeExtractionResponse.status, 200);
    const resumeExtractionBody = (await resumeExtractionResponse.json()) as {
      contractVersion: string;
      extraction: { normalizedSkills: string[]; inferredSeniority: string | null };
    };

    assert.equal(resumeExtractionBody.contractVersion, 'v1');
    assert.ok(resumeExtractionBody.extraction.normalizedSkills.includes('TypeScript'));
    assert.equal(resumeExtractionBody.extraction.inferredSeniority, 'senior');

    const explainResponse = await fetch(`${app.baseUrl}/v1/ai/explain-match`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        userId: '5e991793-c6e9-4f8a-a0d7-0d4c8f403e44',
        canonicalJobId: '7f95c06f-7b8f-4810-b4ee-e3885afcaa58',
        scoreBreakdown: {
          overallScore: 82,
          titleScore: 90,
          skillScore: 84,
          seniorityScore: 83,
          locationScore: 88,
          compensationScore: 65,
          domainScore: 92,
          requirementScore: 80,
          trajectoryScore: 75,
          penaltyScore: 8,
        },
        strengths: ['Strong alignment with required TypeScript stack'],
        gaps: ['No direct Kubernetes production experience listed'],
        dealBreakers: [],
      }),
    });

    assert.equal(explainResponse.status, 200);
    const explainBody = (await explainResponse.json()) as {
      explanation: { recommendation: string };
    };

    assert.equal(explainBody.explanation.recommendation, 'apply');
  } finally {
    await app.close();
  }
});
