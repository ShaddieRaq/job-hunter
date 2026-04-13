import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { AiProviderError } from '../../src/modules/ai/errors.js';
import { createDeterministicAiProvider } from '../../src/modules/ai/deterministic-provider.js';
import { createAiService } from '../../src/modules/ai/service.js';
import type { AiProvider } from '../../src/modules/ai/types.js';
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
      email: `ai.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

const refusalProvider: AiProvider = {
  providerId: 'refusal-provider',
  async extractResume() {
    throw new AiProviderError('provider_refusal', {
      providerId: 'refusal-provider',
      message: 'forced refusal',
    });
  },
  async extractJob() {
    throw new AiProviderError('provider_refusal', {
      providerId: 'refusal-provider',
      message: 'forced refusal',
    });
  },
  async explainMatch() {
    throw new AiProviderError('provider_refusal', {
      providerId: 'refusal-provider',
      message: 'forced refusal',
    });
  },
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

test('ai routes return explicit provider error code when fallback is disabled', async () => {
  const app = await startServer({
    aiService: createAiService({
      provider: refusalProvider,
      fallbackProvider: null,
    }),
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const response = await fetch(`${app.baseUrl}/v1/ai/extract/resume`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        rawText: 'TypeScript engineer profile.',
      }),
    });

    assert.equal(response.status, 502);

    const body = (await response.json()) as {
      error: string;
      details: { providerId: string };
    };

    assert.equal(body.error, 'provider_refusal');
    assert.equal(body.details.providerId, 'refusal-provider');
  } finally {
    await app.close();
  }
});

test('score-match route persists and returns versioned artifacts', async () => {
  const app = await startServer();

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const canonicalJobId = 'cb87f812-f7ca-47cf-83d2-f259f7656f57';

    const requestBody = {
      canonicalJobId,
      resumeExtraction: {
        normalizedSkills: ['TypeScript', 'Node.js', 'AWS'],
        domains: ['fintech'],
        experienceRoles: ['Backend Engineer'],
        yearsExperience: {
          minimum: 6,
          maximum: null,
        },
        inferredSeniority: 'senior',
        preferredLocations: ['United States'],
        remotePreference: 'remote',
        sponsorshipRequired: false,
        workAuthorization: 'United States',
      },
      jobExtraction: {
        normalizedTitle: 'Senior Backend Engineer',
        normalizedSkills: ['TypeScript', 'Node.js', 'AWS', 'Docker'],
        requiredSkills: ['TypeScript', 'Node.js', 'AWS'],
        preferredSkills: ['Docker'],
        requiredYearsExperience: {
          minimum: 5,
          maximum: null,
        },
        domainTags: ['fintech'],
        seniority: 'senior',
        locationConstraint: 'United States',
        remoteType: 'remote',
        sponsorshipAvailable: true,
        salaryMin: 160000,
        salaryMax: 210000,
        salaryCurrency: 'USD',
        salaryPeriod: 'year',
      },
    };

    const firstScoreResponse = await fetch(`${app.baseUrl}/v1/ai/score-match`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    assert.equal(firstScoreResponse.status, 200);
    const firstScoreBody = (await firstScoreResponse.json()) as {
      artifact: { artifactVersion: number; recommendation: string };
    };
    assert.equal(firstScoreBody.artifact.artifactVersion, 1);
    assert.equal(firstScoreBody.artifact.recommendation, 'apply');

    const secondScoreResponse = await fetch(`${app.baseUrl}/v1/ai/score-match`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    assert.equal(secondScoreResponse.status, 200);
    const secondScoreBody = (await secondScoreResponse.json()) as {
      artifact: { artifactVersion: number };
    };
    assert.equal(secondScoreBody.artifact.artifactVersion, 2);

    const latestResponse = await fetch(
      `${app.baseUrl}/v1/ai/score-match/${canonicalJobId}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(latestResponse.status, 200);
    const latestBody = (await latestResponse.json()) as {
      artifact: { artifactVersion: number; scoringVersion: string };
    };
    assert.equal(latestBody.artifact.artifactVersion, 2);
    assert.equal(latestBody.artifact.scoringVersion, 'deterministic-score-v1');

    const versionsResponse = await fetch(
      `${app.baseUrl}/v1/ai/score-match/${canonicalJobId}/versions`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(versionsResponse.status, 200);
    const versionsBody = (await versionsResponse.json()) as {
      artifacts: Array<{ artifactVersion: number }>;
    };
    assert.equal(versionsBody.artifacts.length, 2);
    assert.equal(versionsBody.artifacts[0]?.artifactVersion, 2);
    assert.equal(versionsBody.artifacts[1]?.artifactVersion, 1);
  } finally {
    await app.close();
  }
});

test('score-match route supports explicit explanation disable mode', async () => {
  const app = await startServer({
    aiService: createAiService({
      provider: createDeterministicAiProvider(),
      fallbackProvider: null,
      scoreExplanationMode: 'off',
    }),
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const canonicalJobId = '3effdd04-2b1c-4679-b6c9-351ec9bcb487';

    const response = await fetch(`${app.baseUrl}/v1/ai/score-match`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        resumeExtraction: {
          normalizedSkills: ['TypeScript', 'Node.js'],
          domains: ['fintech'],
          experienceRoles: ['Backend Engineer'],
          yearsExperience: {
            minimum: 5,
            maximum: null,
          },
          inferredSeniority: 'senior',
          preferredLocations: ['United States'],
          remotePreference: 'remote',
          sponsorshipRequired: false,
          workAuthorization: 'United States',
        },
        jobExtraction: {
          normalizedTitle: 'Senior Backend Engineer',
          normalizedSkills: ['TypeScript', 'Node.js'],
          requiredSkills: ['TypeScript', 'Node.js'],
          preferredSkills: [],
          requiredYearsExperience: {
            minimum: 4,
            maximum: null,
          },
          domainTags: ['fintech'],
          seniority: 'senior',
          locationConstraint: 'United States',
          remoteType: 'remote',
          sponsorshipAvailable: true,
          salaryMin: 160000,
          salaryMax: 200000,
          salaryCurrency: 'USD',
          salaryPeriod: 'year',
        },
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      artifact: {
        explanation: unknown;
        explanationMetadata: unknown;
        explanationErrorCode: string | null;
      };
    };

    assert.equal(body.artifact.explanation, null);
    assert.equal(body.artifact.explanationMetadata, null);
    assert.equal(body.artifact.explanationErrorCode, 'explanation_disabled');
  } finally {
    await app.close();
  }
});
