import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createDefaultPreferencesPayload } from '../../src/modules/auth-profile/defaults.js';
import { createInMemoryAuthProfileRepository } from '../../src/modules/auth-profile/in-memory-repository.js';
import { createAuthProfileService } from '../../src/modules/auth-profile/service.js';

const createService = () =>
  createAuthProfileService({
    repository: createInMemoryAuthProfileRepository(),
  });

test('upsertPreferences rejects invalid salary range', async () => {
  const service = createService();
  const session = await service.register({ email: 'salary@test.dev' });

  const payload = {
    ...createDefaultPreferencesPayload(),
    salaryMin: 200_000,
    salaryTarget: 180_000,
  };

  await assert.rejects(
    () => service.upsertPreferences(session.user.userId, payload),
    (error: unknown) =>
      error instanceof HttpError && error.statusCode === 400 && error.code === 'invalid_salary_range',
  );
});

test('upsertPreferences rejects invalid seniority range', async () => {
  const service = createService();
  const session = await service.register({ email: 'seniority@test.dev' });

  const payload = {
    ...createDefaultPreferencesPayload(),
    targetSeniorityMin: 'senior' as const,
    targetSeniorityMax: 'junior' as const,
  };

  await assert.rejects(
    () => service.upsertPreferences(session.user.userId, payload),
    (error: unknown) =>
      error instanceof HttpError && error.statusCode === 400 && error.code === 'invalid_seniority_range',
  );
});

test('upsertPreferences normalizes list duplicates and whitespace', async () => {
  const service = createService();
  const session = await service.register({ email: 'normalize@test.dev' });

  const payload = {
    ...createDefaultPreferencesPayload(),
    preferredTitles: [
      '  Software Engineer  ',
      'software engineer',
      'Data Engineer',
    ],
    preferredSkills: [' TypeScript ', 'typescript', 'Node.js'],
  };

  const updated = await service.upsertPreferences(session.user.userId, payload);

  assert.deepEqual(updated.preferredTitles, ['Software Engineer', 'Data Engineer']);
  assert.deepEqual(updated.preferredSkills, ['TypeScript', 'Node.js']);
});
