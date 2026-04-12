import type { ResumeContentType } from '@job-hunter/shared';

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: ResumeContentType;
}

export interface PutObjectResult {
  uri: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
}