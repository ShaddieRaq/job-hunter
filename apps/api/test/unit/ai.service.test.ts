import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createDeterministicAiProvider } from '../../src/modules/ai/deterministic-provider.js';
import { AiProviderError } from '../../src/modules/ai/errors.js';
import { createAiService } from '../../src/modules/ai/service.js';
import type { AiProvider } from '../../src/modules/ai/types.js';

const createFailingProvider = (errorCode: 'invalid_json_schema' | 'provider_refusal'): AiProvider => ({
  providerId: 'failing-provider',
  async extractResume() {
    throw new AiProviderError(errorCode, {
      providerId: 'failing-provider',
      message: 'forced failure for test',
    });
  },
  async extractJob() {
    throw new AiProviderError(errorCode, {
      providerId: 'failing-provider',
      message: 'forced failure for test',
    });
  },
  async explainMatch() {
    throw new AiProviderError(errorCode, {
      providerId: 'failing-provider',
      message: 'forced failure for test',
    });
  },
});

test('extractResume returns structured deterministic fields', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });
  const userId = randomUUID();

  const result = await service.extractResume(userId, {
    rawText:
      'Senior Software Engineer with 6 years experience. Skills: TypeScript, Node.js, AWS. Looking for remote roles in fintech.',
  });

  assert.equal(result.userId, userId);
  assert.equal(result.extraction.inferredSeniority, 'senior');
  assert.equal(result.extraction.yearsExperience.minimum, 6);
  assert.ok(result.extraction.normalizedSkills.includes('TypeScript'));
  assert.ok(result.extraction.domains.includes('fintech'));
  assert.equal(result.extraction.remotePreference, 'remote');
});

test('explainMatch returns skip when deal breakers exist', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });

  const result = await service.explainMatch({
    userId: randomUUID(),
    canonicalJobId: randomUUID(),
    scoreBreakdown: {
      overallScore: 90,
      titleScore: 90,
      skillScore: 90,
      seniorityScore: 90,
      locationScore: 90,
      compensationScore: 90,
      domainScore: 90,
      requirementScore: 90,
      trajectoryScore: 90,
      penaltyScore: 0,
    },
    strengths: ['Strong TypeScript alignment'],
    gaps: [],
    dealBreakers: ['Requires in-office five days'],
  });

  assert.equal(result.explanation.recommendation, 'skip');
  assert.equal(result.explanation.dealBreakers.length, 1);
});

test('extractResume falls back to deterministic provider on schema failure', async () => {
  const service = createAiService({
    provider: createFailingProvider('invalid_json_schema'),
    fallbackProvider: createDeterministicAiProvider(),
  });

  const result = await service.extractResume(randomUUID(), {
    rawText: 'Senior engineer with 8 years in TypeScript and AWS, open to remote fintech roles.',
  });

  assert.ok(result.metadata.extractorVersion.includes('fallback-invalid_json_schema'));
  assert.equal(result.extraction.inferredSeniority, 'senior');
  assert.ok(result.extraction.normalizedSkills.includes('TypeScript'));
});

test('extractResume propagates provider errors when fallback is disabled', async () => {
  const service = createAiService({
    provider: createFailingProvider('provider_refusal'),
    fallbackProvider: null,
  });

  await assert.rejects(
    async () =>
      service.extractResume(randomUUID(), {
        rawText: 'TypeScript engineer profile.',
      }),
    (error: unknown) =>
      error instanceof AiProviderError && error.code === 'provider_refusal',
  );
});
