import { sourceNameSchema } from '@job-hunter/shared';

import { createGreenhousePublicBoardConnector } from './greenhouse-public-board-connector.js';
import type { SourceConnectorDefinition } from './types.js';

const defaultGreenhouseBoardToken = 'stripe';
const defaultGreenhouseSourceName = 'greenhouse_public_board';

export interface CreateGreenhousePublicBoardConnectorsOptions {
  boardTokenEnv?: string;
  boardTokensEnv?: string;
}

const parseTokenList = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
};

const dedupeTokens = (tokens: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(token);
  }

  return deduped;
};

const toTokenSlug = (token: string): string => {
  const normalized = token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized.length === 0) {
    return 'board';
  }

  return normalized.slice(0, 40);
};

const resolveBoardTokens = ({
  boardTokenEnv,
  boardTokensEnv,
}: CreateGreenhousePublicBoardConnectorsOptions): string[] => {
  const boardTokens = dedupeTokens(parseTokenList(boardTokensEnv));
  if (boardTokens.length > 0) {
    return boardTokens;
  }

  const singleToken = (boardTokenEnv ?? defaultGreenhouseBoardToken).trim();
  if (singleToken.length > 0) {
    return [singleToken];
  }

  return [defaultGreenhouseBoardToken];
};

const buildMultiBoardSourceName = (
  token: string,
  seenSourceNames: Set<string>,
): string => {
  const slug = toTokenSlug(token);
  const base = `${defaultGreenhouseSourceName}_${slug}`;

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

export const createGreenhousePublicBoardConnectors = (
  options: CreateGreenhousePublicBoardConnectorsOptions,
): SourceConnectorDefinition[] => {
  const tokens = resolveBoardTokens(options);
  if (tokens.length === 1) {
    return [
      createGreenhousePublicBoardConnector({
        boardToken: tokens[0] ?? defaultGreenhouseBoardToken,
        sourceName: defaultGreenhouseSourceName,
        displayName: 'Greenhouse Public Board',
      }),
    ];
  }

  const seenSourceNames = new Set<string>();

  return tokens.map((token) => {
    const sourceName = buildMultiBoardSourceName(token, seenSourceNames);

    return createGreenhousePublicBoardConnector({
      boardToken: token,
      sourceName,
      displayName: `Greenhouse Public Board (${token})`,
    });
  });
};
