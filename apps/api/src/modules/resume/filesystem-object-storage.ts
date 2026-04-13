import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ObjectStorage } from './object-storage.js';

export interface CreateFilesystemObjectStorageOptions {
  rootDirectory: string;
}

const normalizeStorageKey = (key: string): string =>
  key
    .replace(/\\/g, '/')
    .replace(/\.{2,}/g, '_')
    .replace(/^\/+/, '');

export const createFilesystemObjectStorage = ({
  rootDirectory,
}: CreateFilesystemObjectStorageOptions): ObjectStorage => ({
  async putObject(input) {
    const normalizedKey = normalizeStorageKey(input.key);
    const filePath = resolve(rootDirectory, normalizedKey);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);

    return {
      uri: pathToFileURL(filePath).toString(),
      sizeBytes: input.body.byteLength,
      checksumSha256: createHash('sha256').update(input.body).digest('hex'),
    };
  },
});
