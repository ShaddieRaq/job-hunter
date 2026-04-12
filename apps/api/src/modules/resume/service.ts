import { randomUUID } from 'node:crypto';

import type {
  ResumeMetadata,
  ResumeStructuredProfile,
  ResumeUploadRequest,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { maxResumeBytes } from './defaults.js';
import type { ObjectStorage } from './object-storage.js';
import type { ResumeParser } from './parser.js';
import type { ResumeRecord, ResumeRepository } from './repository.js';

const normalizeBase64 = (value: string): string => value.replace(/\s+/g, '');

const decodeBase64Content = (contentBase64: string): Buffer => {
  const normalized = normalizeBase64(contentBase64);
  const decoded = Buffer.from(normalized, 'base64');

  if (decoded.byteLength === 0) {
    throw new HttpError(400, 'invalid_resume_content');
  }

  const reEncoded = decoded.toString('base64').replace(/=+$/, '');
  const normalizedWithoutPadding = normalized.replace(/=+$/, '');
  if (reEncoded !== normalizedWithoutPadding) {
    throw new HttpError(400, 'invalid_resume_content');
  }

  return decoded;
};

const sanitizeFilename = (filename: string): string => {
  const sanitized = filename.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized.slice(0, 120) || 'resume.bin';
};

const createStorageKey = (
  userId: string,
  resumeId: string,
  originalFilename: string,
): string =>
  `users/${userId}/resumes/${resumeId}/${sanitizeFilename(originalFilename)}`;

export interface ResumeWithStructuredProfile {
  resume: ResumeMetadata;
  structuredProfile: ResumeStructuredProfile | null;
}

export interface ResumeService {
  uploadResume(
    userId: string,
    payload: ResumeUploadRequest,
  ): Promise<ResumeWithStructuredProfile>;
  listResumes(userId: string): Promise<ResumeMetadata[]>;
  getResume(userId: string, resumeId: string): Promise<ResumeWithStructuredProfile>;
}

export interface CreateResumeServiceOptions {
  repository: ResumeRepository;
  objectStorage: ObjectStorage;
  parser: ResumeParser;
}

export const createResumeService = ({
  repository,
  objectStorage,
  parser,
}: CreateResumeServiceOptions): ResumeService => ({
  async uploadResume(userId, payload) {
    const contentBuffer = decodeBase64Content(payload.contentBase64);
    if (contentBuffer.byteLength > maxResumeBytes) {
      throw new HttpError(413, 'resume_too_large', {
        maxResumeBytes,
      });
    }

    const nowIso = new Date().toISOString();
    const resumeId = randomUUID();
    const storageKey = createStorageKey(userId, resumeId, payload.originalFilename);
    const storageResult = await objectStorage.putObject({
      key: storageKey,
      body: contentBuffer,
      contentType: payload.contentType,
    });

    const parseResult = parser.parse({
      contentType: payload.contentType,
      contentBuffer,
    });

    const resumeRecord: ResumeRecord = {
      resumeId,
      userId,
      originalFilename: payload.originalFilename,
      contentType: payload.contentType,
      fileUri: storageResult.uri,
      sizeBytes: storageResult.sizeBytes,
      checksumSha256: storageResult.checksumSha256,
      parserVersion: parser.parserVersion,
      parseStatus: parseResult.parseStatus,
      uploadedAt: nowIso,
      parsedAt: parseResult.parseStatus === 'parsed' ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso,
      parsedText: parseResult.parsedText,
    };

    const resume = await repository.insertResume(resumeRecord);

    let structuredProfile: ResumeStructuredProfile | null = null;
    if (parseResult.structuredProfile) {
      structuredProfile = {
        resumeId,
        ...parseResult.structuredProfile,
        extractedAt: nowIso,
      };

      await repository.upsertStructuredProfile(structuredProfile);
    }

    return {
      resume,
      structuredProfile,
    };
  },

  async listResumes(userId) {
    return repository.listResumesByUserId(userId);
  },

  async getResume(userId, resumeId) {
    const resume = await repository.findResumeById(userId, resumeId);
    if (!resume) {
      throw new HttpError(404, 'resume_not_found', { resumeId });
    }

    const structuredProfile =
      await repository.findStructuredProfileByResumeId(resumeId);

    return {
      resume,
      structuredProfile,
    };
  },
});