import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import type {
  JobExtractionRequest,
  MatchExplanationRequest,
  MatchScoreRequest,
  ResumeExtractionRequest,
  UserPreferences,
} from '@job-hunter/shared';

import { createDeterministicAiProvider } from '../../src/modules/ai/deterministic-provider.js';
import { AiProviderError } from '../../src/modules/ai/errors.js';
import {
  maxProviderRawTextLength,
  providerScopedUserId,
  redactionMarker,
} from '../../src/modules/ai/privacy.js';
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

const createUnexpectedEvidenceProvider = (): AiProvider => ({
  providerId: 'unexpected-evidence-provider',
  async extractResume(payload) {
    return createDeterministicAiProvider().extractResume(payload);
  },
  async extractJob(payload) {
    return createDeterministicAiProvider().extractJob(payload);
  },
  async explainMatch() {
    return {
      output: {
        summary: 'Strong fit with unsupported claims.',
        strengths: ['Guaranteed relocation package'],
        gaps: [],
        dealBreakers: [],
        recommendation: 'apply',
      },
      extractorVersion: 'unexpected-evidence-v1',
      modelVersion: 'unexpected-evidence-model',
    };
  },
});

const createRecordingProvider = (): {
  provider: AiProvider;
  calls: {
    resumePayload: ResumeExtractionRequest | null;
    jobPayload: JobExtractionRequest | null;
    explanationPayload: MatchExplanationRequest | null;
  };
} => {
  const deterministicProvider = createDeterministicAiProvider();

  const calls = {
    resumePayload: null as ResumeExtractionRequest | null,
    jobPayload: null as JobExtractionRequest | null,
    explanationPayload: null as MatchExplanationRequest | null,
  };

  return {
    provider: {
      providerId: 'recording-provider',
      async extractResume(payload) {
        calls.resumePayload = payload;
        return deterministicProvider.extractResume(payload);
      },
      async extractJob(payload) {
        calls.jobPayload = payload;
        return deterministicProvider.extractJob(payload);
      },
      async explainMatch(payload) {
        calls.explanationPayload = payload;
        return deterministicProvider.explainMatch(payload);
      },
    },
    calls,
  };
};

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

test('extractResume sanitizes sensitive text before provider call', async () => {
  const recording = createRecordingProvider();
  const service = createAiService({
    provider: recording.provider,
    fallbackProvider: null,
  });

  await service.extractResume(randomUUID(), {
    rawText: [
      'Email: candidate@example.com',
      'Phone: +1 (415) 555-0199',
      'Portfolio: https://portfolio.example.dev/candidate',
      'SSN: 123-45-6789',
      'Skills: TypeScript Node.js AWS',
      'Notes:',
      'TypeScript '.repeat(8_000),
    ].join('\n'),
    sourceFilename: 'Candidate_Resume_2026.pdf',
  });

  const payload = recording.calls.resumePayload;
  assert.ok(payload);
  assert.equal(payload?.sourceFilename, undefined);
  assert.equal(
    payload?.rawText.includes('candidate@example.com'),
    false,
  );
  assert.equal(payload?.rawText.includes('+1 (415) 555-0199'), false);
  assert.equal(payload?.rawText.includes('https://portfolio.example.dev/candidate'), false);
  assert.equal(payload?.rawText.includes('123-45-6789'), false);
  assert.ok(payload?.rawText.includes(redactionMarker));
  assert.ok(
    payload &&
      payload.rawText.length <= maxProviderRawTextLength,
  );
});

test('extractJob removes source job identifiers before provider call', async () => {
  const recording = createRecordingProvider();
  const service = createAiService({
    provider: recording.provider,
    fallbackProvider: null,
  });

  await service.extractJob({
    rawText:
      'Senior backend role. Contact jobs@example.com or +1 650 555 0100 for details.',
    sourceJobId: 'gh_123456',
    sourceName: 'greenhouse_public_board',
  });

  const payload = recording.calls.jobPayload;
  assert.ok(payload);
  assert.equal(payload?.sourceJobId, undefined);
  assert.equal(payload?.sourceName, 'greenhouse_public_board');
  assert.equal(payload?.rawText.includes('jobs@example.com'), false);
  assert.equal(payload?.rawText.includes('+1 650 555 0100'), false);
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

test('explainMatch anonymizes user identity before provider call', async () => {
  const recording = createRecordingProvider();
  const service = createAiService({
    provider: recording.provider,
    fallbackProvider: null,
  });

  await service.explainMatch({
    userId: randomUUID(),
    canonicalJobId: randomUUID(),
    scoreBreakdown: {
      overallScore: 80,
      titleScore: 80,
      skillScore: 80,
      seniorityScore: 80,
      locationScore: 80,
      compensationScore: 80,
      domainScore: 80,
      requirementScore: 80,
      trajectoryScore: 80,
      penaltyScore: 0,
    },
    strengths: ['Reference call with candidate@example.com'],
    gaps: [],
    dealBreakers: [],
  });

  const payload = recording.calls.explanationPayload;
  assert.ok(payload);
  assert.equal(payload?.userId, providerScopedUserId);
  assert.equal(payload?.strengths[0]?.includes('candidate@example.com'), false);
  assert.ok(payload?.strengths[0]?.includes(redactionMarker));
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

test('scoreMatch applies guardrail fallback when explanation evidence is unsupported', async () => {
  const service = createAiService({
    provider: createUnexpectedEvidenceProvider(),
    fallbackProvider: null,
    scoreExplanationMode: 'provider',
    scoreExplanationRolloutPercent: 100,
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();

  const result = await service.scoreMatch(
    userId,
    createMatchScorePayload(canonicalJobId),
    createPreferences(userId),
  );

  assert.equal(result.artifact.explanationErrorCode, 'explanation_guardrail_fallback');
  assert.ok(result.artifact.explanation);
  assert.ok(
    result.artifact.explanation?.strengths.every((value) =>
      result.artifact.strengths.includes(value),
    ),
  );
});

test('scoreMatch anonymizes provider explanation requests', async () => {
  const recording = createRecordingProvider();
  const service = createAiService({
    provider: recording.provider,
    fallbackProvider: null,
    scoreExplanationMode: 'provider',
    scoreExplanationRolloutPercent: 100,
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();

  await service.scoreMatch(
    userId,
    createMatchScorePayload(canonicalJobId),
    createPreferences(userId),
  );

  const payload = recording.calls.explanationPayload;
  assert.ok(payload);
  assert.equal(payload?.userId, providerScopedUserId);
  assert.equal(payload?.canonicalJobId, canonicalJobId);
});

test('scoreMatch uses rollout guardrail when provider traffic is disabled', async () => {
  const service = createAiService({
    provider: createFailingProvider('provider_refusal'),
    fallbackProvider: null,
    scoreExplanationMode: 'provider',
    scoreExplanationRolloutPercent: 0,
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();

  const result = await service.scoreMatch(
    userId,
    createMatchScorePayload(canonicalJobId),
    createPreferences(userId),
  );

  assert.equal(result.artifact.explanationErrorCode, 'explanation_rollout_excluded');
  assert.ok(result.artifact.explanation);
});

test('scoreMatch can disable explanation generation with explicit mode', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
    scoreExplanationMode: 'off',
  });

  const userId = randomUUID();
  const canonicalJobId = randomUUID();

  const result = await service.scoreMatch(
    userId,
    createMatchScorePayload(canonicalJobId),
    createPreferences(userId),
  );

  assert.equal(result.artifact.explanation, null);
  assert.equal(result.artifact.explanationMetadata, null);
  assert.equal(result.artifact.explanationErrorCode, 'explanation_disabled');
});
