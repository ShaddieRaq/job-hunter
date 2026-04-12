import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { AiProviderError } from '../../src/modules/ai/errors.js';
import { createOpenAiAiProvider } from '../../src/modules/ai/openai-provider.js';

const createMockFetch = (status: number, body: unknown): typeof fetch =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
    }) as Response) as typeof fetch;

test('openai provider parses schema-valid resume extraction responses', async () => {
  const provider = createOpenAiAiProvider({
    apiKey: 'test-key',
    fetchImpl: createMockFetch(200, {
      model: 'gpt-4.1-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              normalizedSkills: ['TypeScript', 'AWS'],
              domains: ['fintech'],
              experienceRoles: ['Software Engineer'],
              yearsExperience: { minimum: 5, maximum: null },
              inferredSeniority: 'senior',
              preferredLocations: ['San Francisco'],
              remotePreference: 'remote',
              sponsorshipRequired: null,
              workAuthorization: null,
            }),
          },
        },
      ],
    }),
  });

  const result = await provider.extractResume({
    rawText: 'Senior engineer with 5 years of TypeScript, AWS and fintech experience.',
  });

  assert.equal(result.modelVersion, 'gpt-4.1-mini');
  assert.ok(result.output.normalizedSkills.includes('TypeScript'));
  assert.equal(result.output.inferredSeniority, 'senior');
});

test('openai provider surfaces invalid_json_schema on schema mismatch', async () => {
  const provider = createOpenAiAiProvider({
    apiKey: 'test-key',
    fetchImpl: createMockFetch(200, {
      model: 'gpt-4.1-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              normalizedSkills: [],
            }),
          },
        },
      ],
    }),
  });

  await assert.rejects(
    async () =>
      provider.extractResume({
        rawText: 'Resume text',
      }),
    (error: unknown) =>
      error instanceof AiProviderError && error.code === 'invalid_json_schema',
  );
});

test('openai provider surfaces provider_refusal when the model refuses', async () => {
  const provider = createOpenAiAiProvider({
    apiKey: 'test-key',
    fetchImpl: createMockFetch(200, {
      model: 'gpt-4.1-mini',
      choices: [
        {
          message: {
            refusal: 'I cannot help with this request.',
            content: null,
          },
        },
      ],
    }),
  });

  await assert.rejects(
    async () =>
      provider.explainMatch({
        userId: randomUUID(),
        canonicalJobId: randomUUID(),
        scoreBreakdown: {
          overallScore: 50,
          titleScore: 50,
          skillScore: 50,
          seniorityScore: 50,
          locationScore: 50,
          compensationScore: 50,
          domainScore: 50,
          requirementScore: 50,
          trajectoryScore: 50,
          penaltyScore: 0,
        },
        strengths: ['TypeScript'],
        gaps: ['Kubernetes'],
        dealBreakers: [],
      }),
    (error: unknown) =>
      error instanceof AiProviderError && error.code === 'provider_refusal',
  );
});