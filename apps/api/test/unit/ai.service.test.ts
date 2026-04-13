import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import type { MatchScoreRequest, UserPreferences } from '@job-hunter/shared';

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

const createPreferences = (userId: string): UserPreferences => {
  const nowIso = new Date().toISOString();

  return {
    userId,
    preferredTitles: ['Backend Engineer'],
    preferredIndustries: ['fintech'],
    preferredSkills: ['TypeScript', 'Node.js'],
    preferredLocations: ['United States'],
    remotePreference: 'remote',
    targetSeniorityMin: 'mid',
    targetSeniorityMax: 'senior',
    salaryMin: 140000,
    salaryTarget: 180000,
    dealBreakers: ['onsite'],
    hiddenCompanies: [],
    hiddenTitles: [],
    stretchPreferenceLevel: 3,
    notificationPreferences: {
      dailyDigest: true,
      weeklyDigest: true,
      instantHighFit: true,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

const createMatchScorePayload = (canonicalJobId: string): MatchScoreRequest => ({
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
    salaryMin: 150000,
    salaryMax: 190000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
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

test('scoreMatch persists versioned artifacts and latest retrieval works', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();
  const preferences = createPreferences(userId);
  const payload = createMatchScorePayload(canonicalJobId);

  const first = await service.scoreMatch(userId, payload, preferences);
  const second = await service.scoreMatch(userId, payload, preferences);

  assert.equal(first.artifact.artifactVersion, 1);
  assert.equal(second.artifact.artifactVersion, 2);
  assert.equal(first.artifact.scoringVersion, 'deterministic-score-v1');

  const latest = await service.getLatestMatchArtifact(userId, canonicalJobId);
  assert.ok(latest);
  assert.equal(latest?.artifactVersion, 2);

  const versions = await service.listMatchArtifacts(userId, canonicalJobId);
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.artifactVersion, 2);
  assert.equal(versions[1]?.artifactVersion, 1);
});

test('scoreMatch surfaces salary floor conflict as deterministic deal breaker', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();
  const preferences = {
    ...createPreferences(userId),
    salaryMin: 220000,
    salaryTarget: 240000,
  };

  const payload = createMatchScorePayload(canonicalJobId);

  const result = await service.scoreMatch(userId, payload, preferences);
  assert.equal(result.artifact.recommendation, 'skip');
  assert.ok(
    result.artifact.dealBreakers.some((reason) =>
      reason.toLowerCase().includes('compensation range is below'),
    ),
  );
});
