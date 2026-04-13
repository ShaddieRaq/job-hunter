import type { SavedSearch, SavedSearchId } from '@job-hunter/shared';

import type { SavedSearchRepository } from './repository.js';

const savedSearchNameKey = (userId: string, name: string): string =>
  `${userId}:${name.trim().toLowerCase()}`;

const cloneSavedSearch = (savedSearch: SavedSearch): SavedSearch => ({
  ...savedSearch,
  query: {
    ...savedSearch.query,
  },
});

export const createInMemorySavedSearchRepository = (): SavedSearchRepository => {
  const savedSearchesById = new Map<SavedSearchId, SavedSearch>();
  const savedSearchIdByName = new Map<string, SavedSearchId>();

  return {
    async createSavedSearch(savedSearch) {
      savedSearchesById.set(savedSearch.savedSearchId, cloneSavedSearch(savedSearch));
      savedSearchIdByName.set(
        savedSearchNameKey(savedSearch.userId, savedSearch.name),
        savedSearch.savedSearchId,
      );

      return cloneSavedSearch(savedSearch);
    },

    async updateSavedSearch(savedSearch) {
      const existing = savedSearchesById.get(savedSearch.savedSearchId);
      if (existing) {
        savedSearchIdByName.delete(savedSearchNameKey(existing.userId, existing.name));
      }

      savedSearchesById.set(savedSearch.savedSearchId, cloneSavedSearch(savedSearch));
      savedSearchIdByName.set(
        savedSearchNameKey(savedSearch.userId, savedSearch.name),
        savedSearch.savedSearchId,
      );

      return cloneSavedSearch(savedSearch);
    },

    async findSavedSearchById(userId, savedSearchId) {
      const savedSearch = savedSearchesById.get(savedSearchId);
      if (!savedSearch || savedSearch.userId !== userId) {
        return null;
      }

      return cloneSavedSearch(savedSearch);
    },

    async findSavedSearchByName(userId, name) {
      const existingId = savedSearchIdByName.get(savedSearchNameKey(userId, name));
      if (!existingId) {
        return null;
      }

      const savedSearch = savedSearchesById.get(existingId);
      if (!savedSearch || savedSearch.userId !== userId) {
        return null;
      }

      return cloneSavedSearch(savedSearch);
    },

    async listSavedSearches({ userId, limit }) {
      return [...savedSearchesById.values()]
        .filter((savedSearch) => savedSearch.userId === userId)
        .sort((left, right) => {
          if (left.updatedAt !== right.updatedAt) {
            return right.updatedAt.localeCompare(left.updatedAt);
          }

          return right.createdAt.localeCompare(left.createdAt);
        })
        .slice(0, limit)
        .map(cloneSavedSearch);
    },

    async deleteSavedSearch(userId, savedSearchId) {
      const existing = savedSearchesById.get(savedSearchId);
      if (!existing || existing.userId !== userId) {
        return false;
      }

      savedSearchesById.delete(savedSearchId);
      savedSearchIdByName.delete(savedSearchNameKey(existing.userId, existing.name));
      return true;
    },
  };
};
