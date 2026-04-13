import type { SavedSearch, SavedSearchId } from '@job-hunter/shared';

export interface SavedSearchRepository {
  createSavedSearch(savedSearch: SavedSearch): Promise<SavedSearch>;
  updateSavedSearch(savedSearch: SavedSearch): Promise<SavedSearch>;
  findSavedSearchById(
    userId: string,
    savedSearchId: SavedSearchId,
  ): Promise<SavedSearch | null>;
  findSavedSearchByName(userId: string, name: string): Promise<SavedSearch | null>;
  listSavedSearches(options: {
    userId: string;
    limit: number;
  }): Promise<SavedSearch[]>;
  deleteSavedSearch(userId: string, savedSearchId: SavedSearchId): Promise<boolean>;
}
