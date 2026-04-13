import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CanonicalJobDetail,
  CanonicalJobId,
  UserPreferences,
  UserProfile,
} from '@job-hunter/shared';

import { HttpError } from '../../src/http/http-errors.js';
import { createApplicationService } from '../../src/modules/applications/service.js';

const nowIso = '2026-04-12T16:00:00.000Z';

const createCanonicalJob = (canonicalJobId: CanonicalJobId): CanonicalJobDetail => ({
  job: {
    canonicalJobId,
    canonicalCompanyName: 'Acme Labs',
    canonicalTitle: 'Senior Backend Engineer',
    normalizedLocation: 'Remote - United States',
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: 170000,
    salaryMax: 210000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 1,
    sourceNames: ['greenhouse_public_board'],
    jobStatus: 'open',
    topSkills: ['TypeScript', 'Node.js'],
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  sourceMappings: [
    {
      sourceName: 'greenhouse_public_board',
      sourceJobId: '1001',
      isPrimary: true,
      mappingConfidence: 1,
      mappingReasonCodes: ['exact_company_title'],
    },
  ],
});

const createProfile = (userId: string): UserProfile => ({
  userId,
  currentTitle: 'Senior Backend Engineer',
  yearsExperience: 8,
  summary: 'Builds reliable distributed systems.',
  workAuthorization: 'citizen',
  sponsorshipRequired: false,
  transitionNotes: null,
  createdAt: nowIso,
  updatedAt: nowIso,
});

const createPreferences = (userId: string): UserPreferences => ({
  userId,
  preferredTitles: ['Senior Backend Engineer'],
  preferredIndustries: ['Software'],
  preferredSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  preferredLocations: ['United States'],
  remotePreference: 'remote',
  targetSeniorityMin: 'senior',
  targetSeniorityMax: 'principal',
  salaryMin: 170000,
  salaryTarget: 200000,
  dealBreakers: [],
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
});

test('createApplication stores default ready_to_apply record', async () => {
  const canonicalJobId = '7f20d47d-fc39-4fea-b7ea-fb83d8f30f75';

  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume() {
        return { ok: true };
      },
    },
    now: () => new Date(nowIso),
  });

  const application = await service.createApplication(
    '5bfd6f67-808f-48c7-b30c-ea1f7bc5ee6d',
    {
      canonicalJobId,
      notes: '  Strong fit from feed review  ',
    },
  );

  assert.equal(application.status, 'ready_to_apply');
  assert.equal(application.appliedAt, null);
  assert.equal(application.notes, 'Strong fit from feed review');
});

test('createApplication rejects duplicate application for the same canonical job', async () => {
  const canonicalJobId = '283eaad2-ae17-4d8e-95d5-37ef32c2964d';
  const userId = 'c015d06c-8823-4513-af0f-a2908daf6a11';

  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume() {
        return { ok: true };
      },
    },
  });

  await service.createApplication(userId, {
    canonicalJobId,
  });

  await assert.rejects(
    async () =>
      service.createApplication(userId, {
        canonicalJobId,
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'application_already_exists_for_job' &&
      error.statusCode === 409,
  );
});

test('createApplication validates resume existence when resumeIdUsed is provided', async () => {
  const canonicalJobId = 'e90b0f8f-7304-4554-a076-f4f6f281cb66';

  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume(_userId, resumeId) {
        throw new HttpError(404, 'resume_not_found', {
          resumeId,
        });
      },
    },
  });

  await assert.rejects(
    async () =>
      service.createApplication('ea4b1824-c3e7-4aef-93e5-7e40d9552026', {
        canonicalJobId,
        resumeIdUsed: '307373c7-2977-4291-a376-59f545f9f2da',
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === 'resume_not_found' &&
      error.statusCode === 404,
  );
});

test('updateApplication changes status and auto-populates appliedAt when needed', async () => {
  const canonicalJobId = 'fe6fe91d-b52e-4401-88f5-b74d89b76f3e';
  const userId = 'cd051bb0-1f6f-4ddf-bd2d-c048f5f0ad3b';

  let nowCursor = Date.parse(nowIso);
  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume() {
        return { ok: true };
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const created = await service.createApplication(userId, {
    canonicalJobId,
  });

  const updated = await service.updateApplication(userId, created.applicationId, {
    status: 'applied',
    resumeIdUsed: '6df3fcf6-6d2c-4e48-b7df-76896f6b2f8f',
    applicationUrl: 'https://jobs.example.com/apply/1234',
  });

  assert.equal(updated.status, 'applied');
  assert.ok(updated.appliedAt);
  assert.equal(updated.resumeIdUsed, '6df3fcf6-6d2c-4e48-b7df-76896f6b2f8f');
  assert.equal(updated.applicationUrl, 'https://jobs.example.com/apply/1234');
});

test('listApplications filters by status and canonical job', async () => {
  const canonicalJobA = 'f4eb6d92-f95d-476f-a4a5-a6b5a18b0e4c';
  const canonicalJobB = 'f7d7fa8c-8bd8-4f8b-b774-af402f737f5c';
  const userId = '1d99f59f-2f1f-4f51-9b2e-4fe0ff6295f0';

  let nowCursor = Date.parse(nowIso);
  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        if (id === canonicalJobA) {
          return createCanonicalJob(canonicalJobA);
        }

        if (id === canonicalJobB) {
          return createCanonicalJob(canonicalJobB);
        }

        return null;
      },
    },
    resumeLookup: {
      async getResume() {
        return { ok: true };
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const first = await service.createApplication(userId, {
    canonicalJobId: canonicalJobA,
  });

  await service.createApplication(userId, {
    canonicalJobId: canonicalJobB,
    status: 'applied',
  });

  const all = await service.listApplications({
    userId,
    limit: 10,
  });
  assert.equal(all.length, 2);
  assert.equal(all[0]?.canonicalJobId, canonicalJobB);

  const readyOnly = await service.listApplications({
    userId,
    status: 'ready_to_apply',
    limit: 10,
  });
  assert.equal(readyOnly.length, 1);
  assert.equal(readyOnly[0]?.applicationId, first.applicationId);

  const byCanonical = await service.listApplications({
    userId,
    canonicalJobId: canonicalJobA,
    limit: 10,
  });
  assert.equal(byCanonical.length, 1);
  assert.equal(byCanonical[0]?.canonicalJobId, canonicalJobA);
});

test('getApplicationMaterialGuidance returns deterministic tailoring suggestions', async () => {
  const canonicalJobId = 'f2eb26d8-2c4b-4aa8-82bf-cf2c0d272f0d';
  const userId = '28b89962-c138-4b6e-a020-aac925f5a2bc';

  const service = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume() {
        return { ok: true };
      },
    },
    now: () => new Date(nowIso),
  });

  const created = await service.createApplication(userId, {
    canonicalJobId,
    status: 'ready_to_apply',
  });

  const guidance = await service.getApplicationMaterialGuidance({
    userId,
    applicationId: created.applicationId,
    profile: createProfile(userId),
    preferences: createPreferences(userId),
  });

  assert.equal(guidance.application.applicationId, created.applicationId);
  assert.equal(guidance.canonicalJob.canonicalJobId, canonicalJobId);
  assert.ok(guidance.checklist.length >= 3);
  assert.ok(guidance.keywordSuggestions.includes('TypeScript'));
  assert.ok(guidance.bulletSuggestions.length >= 1);
  assert.ok(guidance.coverLetterTalkingPoints.length >= 2);
});
