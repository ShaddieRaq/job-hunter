import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createInMemoryObjectStorage } from '../../src/modules/resume/in-memory-object-storage.js';
import { createHeuristicResumeParser } from '../../src/modules/resume/parser.js';
import { createInMemoryResumeRepository } from '../../src/modules/resume/in-memory-repository.js';
import { createResumeService } from '../../src/modules/resume/service.js';

const createService = () =>
  createResumeService({
    repository: createInMemoryResumeRepository(),
    objectStorage: createInMemoryObjectStorage(),
    parser: createHeuristicResumeParser(),
  });

test('uploadResume stores metadata and parses text/plain into structured profile', async () => {
  const service = createService();
  const userId = randomUUID();

  const content = [
    'Senior Software Engineer',
    'Experience: Senior Software Engineer at Acme Corp',
    'Skills: TypeScript, Node.js, SQL, AWS',
    'Education: Bachelor of Science in Computer Science',
    'Certifications: AWS Certified Developer',
  ].join('\n');

  const uploaded = await service.uploadResume(userId, {
    originalFilename: 'resume.txt',
    contentType: 'text/plain',
    contentBase64: Buffer.from(content, 'utf8').toString('base64'),
  });

  assert.equal(uploaded.resume.userId, userId);
  assert.equal(uploaded.resume.originalFilename, 'resume.txt');
  assert.equal(uploaded.resume.contentType, 'text/plain');
  assert.equal(uploaded.resume.parseStatus, 'parsed');
  assert.equal(uploaded.resume.parserVersion, 'resume-parser-v1');
  assert.match(uploaded.resume.checksumSha256, /^[a-f0-9]{64}$/);
  assert.ok(uploaded.resume.fileUri.startsWith('memory://object-storage/'));

  assert.ok(uploaded.structuredProfile);
  assert.equal(uploaded.structuredProfile?.resumeId, uploaded.resume.resumeId);
  assert.ok(uploaded.structuredProfile?.normalizedSkills.includes('TypeScript'));
  assert.ok(uploaded.structuredProfile?.normalizedSkills.includes('Node.js'));
  assert.equal(uploaded.structuredProfile?.inferredSeniority, 'senior');
});

test('uploadResume returns unsupported_format for non-text content', async () => {
  const service = createService();
  const userId = randomUUID();

  const uploaded = await service.uploadResume(userId, {
    originalFilename: 'resume.pdf',
    contentType: 'application/pdf',
    contentBase64: Buffer.from('%PDF-1.4 fake-pdf-content', 'utf8').toString(
      'base64',
    ),
  });

  assert.equal(uploaded.resume.parseStatus, 'unsupported_format');
  assert.equal(uploaded.structuredProfile, null);
});

test('getResume throws not found when resume does not exist for user', async () => {
  const service = createService();

  await assert.rejects(
    () => service.getResume(randomUUID(), randomUUID()),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 404 &&
      error.code === 'resume_not_found',
  );
});