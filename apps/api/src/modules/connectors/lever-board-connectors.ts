import { sourceNameSchema } from '@job-hunter/shared';

import { createLeverPublicBoardConnector } from './lever-public-board-connector.js';
import type { SourceConnectorDefinition } from './types.js';

const defaultLeverCompanyHandle = 'netflix';
const defaultLeverSourceName = 'lever_public_board';

export interface CreateLeverPublicBoardConnectorsOptions {
  companyHandleEnv?: string;
  companyHandlesEnv?: string;
}

const parseHandleList = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0);
};

const dedupeHandles = (handles: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const handle of handles) {
    const key = handle.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(handle);
  }

  return deduped;
};

const toHandleSlug = (handle: string): string => {
  const normalized = handle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized.length === 0) {
    return 'company';
  }

  return normalized.slice(0, 40);
};

const resolveCompanyHandles = ({
  companyHandleEnv,
  companyHandlesEnv,
}: CreateLeverPublicBoardConnectorsOptions): string[] => {
  const handles = dedupeHandles(parseHandleList(companyHandlesEnv));
  if (handles.length > 0) {
    return handles;
  }

  const singleHandle = (companyHandleEnv ?? defaultLeverCompanyHandle).trim();
  if (singleHandle.length > 0) {
    return [singleHandle];
  }

  return [defaultLeverCompanyHandle];
};

const buildMultiHandleSourceName = (
  handle: string,
  seenSourceNames: Set<string>,
): string => {
  const slug = toHandleSlug(handle);
  const base = `${defaultLeverSourceName}_${slug}`;

  let candidate = base;
  let duplicateIndex = 2;

  while (seenSourceNames.has(candidate)) {
    const suffix = `_${duplicateIndex}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    duplicateIndex += 1;
  }

  seenSourceNames.add(candidate);
  return sourceNameSchema.parse(candidate);
};

export const createLeverPublicBoardConnectors = (
  options: CreateLeverPublicBoardConnectorsOptions,
): SourceConnectorDefinition[] => {
  const handles = resolveCompanyHandles(options);

  if (handles.length === 1) {
    return [
      createLeverPublicBoardConnector({
        companyHandle: handles[0] ?? defaultLeverCompanyHandle,
        sourceName: defaultLeverSourceName,
        displayName: 'Lever Public Board',
      }),
    ];
  }

  const seenSourceNames = new Set<string>();

  return handles.map((handle) => {
    const sourceName = buildMultiHandleSourceName(handle, seenSourceNames);

    return createLeverPublicBoardConnector({
      companyHandle: handle,
      sourceName,
      displayName: `Lever Public Board (${handle})`,
    });
  });
};
