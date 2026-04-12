import { createHash } from 'node:crypto';

import type { ResumeContentType } from '@job-hunter/shared';

import type { ObjectStorage } from './object-storage.js';

interface StoredObject {
  body: Buffer;
  contentType: ResumeContentType;
  checksumSha256: string;
  uri: string;
}

const encodeStorageKey = (key: string): string =>
  key.split('/').map((segment) => encodeURIComponent(segment)).join('/');

export const createInMemoryObjectStorage = (): ObjectStorage => {
  const objectsByKey = new Map<string, StoredObject>();

  return {
    async putObject({ key, body, contentType }) {
      const storedBody = Buffer.from(body);
      const checksumSha256 = createHash('sha256')
        .update(storedBody)
        .digest('hex');
      const uri = `memory://object-storage/${encodeStorageKey(key)}`;

      objectsByKey.set(key, {
        body: storedBody,
        contentType,
        checksumSha256,
        uri,
      });

      return {
        uri,
        sizeBytes: storedBody.byteLength,
        checksumSha256,
      };
    },
  };
};