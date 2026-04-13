import { randomUUID } from 'node:crypto';

import type {
  SavedSearch,
  SavedSearchCreateRequest,
  SavedSearchId,
  SavedSearchSourceFilter,
} from '@job-hunter/shared';
import { savedSearchSourceFilterSchema } from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { createInMemorySavedSearchRepository } from './in-memory-repository.js';
import type { SavedSearchRepository } from './repository.js';

const defaultListLimit = 25;
const maxListLimit = 200;

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.max(1, Math.min(maxListLimit, limit));
};

const normalizeQueryText = (value: string): string => value.trim().slice(0, 120);

const normalizeSourceFilter = (value: unknown): SavedSearchSourceFilter => {
  const parsed = savedSearchSourceFilterSchema.safeParse(value);
  if (!parsed.success) {
    return 'any';
  }

  return parsed.data;
};

const normalizeSavedSearchShape = (savedSearch: SavedSearch): SavedSearch => {
  const rawSource = (savedSearch.query as SavedSearch['query'] & { source?: unknown })
    .source;

  return {
    ...savedSearch,
    query: {
      ...savedSearch.query,
      source: normalizeSourceFilter(rawSource),
    },
  };
};

export interface SavedSearchService {
  listSavedSearches(options: { userId: string; limit?: number }): Promise<SavedSearch[]>;
  createSavedSearch(
    userId: string,
    input: SavedSearchCreateRequest,
  ): Promise<SavedSearch>;
  getSavedSearch(userId: string, savedSearchId: SavedSearchId): Promise<SavedSearch | null>;
  deleteSavedSearch(userId: string, savedSearchId: SavedSearchId): Promise<void>;
}

export interface CreateSavedSearchServiceOptions {
  repository?: SavedSearchRepository;
  now?: () => Date;
}

export const createSavedSearchService = ({
  repository = createInMemorySavedSearchRepository(),
  now = () => new Date(),
}: CreateSavedSearchServiceOptions = {}): SavedSearchService => ({
  async listSavedSearches({ userId, limit }) {
    const resolvedLimit = normalizeLimit(limit);

    const savedSearches = await repository.listSavedSearches({
      userId,
      limit: resolvedLimit,
    });

    return savedSearches.map(normalizeSavedSearchShape);
  },

  async createSavedSearch(userId, input) {
    const normalizedName = input.name.trim().slice(0, 80);

    const existing = await repository.findSavedSearchByName(userId, normalizedName);
    if (existing) {
      throw new HttpError(409, 'saved_search_name_exists', {
        name: normalizedName,
      });
    }

    const nowIso = now().toISOString();
    const savedSearch: SavedSearch = {
      savedSearchId: randomUUID(),
      userId,
      name: normalizedName,
      query: {
        ...input.query,
        q: normalizeQueryText(input.query.q),
      },
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUsedAt: null,
    };

    return normalizeSavedSearchShape(await repository.createSavedSearch(savedSearch));
  },

  async getSavedSearch(userId, savedSearchId) {
    const savedSearch = await repository.findSavedSearchById(userId, savedSearchId);
    return savedSearch ? normalizeSavedSearchShape(savedSearch) : null;
  },

  async deleteSavedSearch(userId, savedSearchId) {
    const deleted = await repository.deleteSavedSearch(userId, savedSearchId);

    if (!deleted) {
      throw new HttpError(404, 'saved_search_not_found', {
        savedSearchId,
      });
    }
  },
});
