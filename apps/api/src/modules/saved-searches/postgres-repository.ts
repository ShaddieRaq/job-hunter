import type { SavedSearch } from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { SavedSearchRepository } from './repository.js';

interface SavedSearchRow {
  saved_search_id: string;
  user_id: string;
  name: string;
  query_text: string;
  recommendation_filter: SavedSearch['query']['recommendation'];
  remote_filter: SavedSearch['query']['remote'];
  source_filter: SavedSearch['query']['source'];
  sort_mode: SavedSearch['query']['sort'];
  include_hidden: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

const rowToSavedSearch = (row: SavedSearchRow): SavedSearch => ({
  savedSearchId: row.saved_search_id,
  userId: row.user_id,
  name: row.name,
  query: {
    q: row.query_text,
    recommendation: row.recommendation_filter,
    remote: row.remote_filter,
    source: row.source_filter,
    sort: row.sort_mode,
    includeHidden: row.include_hidden,
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastUsedAt: row.last_used_at,
});

const returningClause = `RETURNING
  saved_search_id,
  user_id,
  name,
  query_text,
  recommendation_filter,
  remote_filter,
  source_filter,
  sort_mode,
  include_hidden,
  created_at::text,
  updated_at::text,
  last_used_at::text`;

export const createPostgresSavedSearchRepository = (
  pool: PostgresPool,
): SavedSearchRepository => ({
  async createSavedSearch(savedSearch) {
    const result = await pool.query<SavedSearchRow>(
      `INSERT INTO user_saved_searches (
         saved_search_id,
         user_id,
         name,
         query_text,
         recommendation_filter,
         remote_filter,
         source_filter,
         sort_mode,
         include_hidden,
         created_at,
         updated_at,
         last_used_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10::timestamptz,
         $11::timestamptz,
         $12::timestamptz
       )
       ${returningClause}`,
      [
        savedSearch.savedSearchId,
        savedSearch.userId,
        savedSearch.name,
        savedSearch.query.q,
        savedSearch.query.recommendation,
        savedSearch.query.remote,
        savedSearch.query.source,
        savedSearch.query.sort,
        savedSearch.query.includeHidden,
        savedSearch.createdAt,
        savedSearch.updatedAt,
        savedSearch.lastUsedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('saved_search_insert_failed');
    }

    return rowToSavedSearch(row);
  },

  async updateSavedSearch(savedSearch) {
    const result = await pool.query<SavedSearchRow>(
      `UPDATE user_saved_searches
       SET
         name = $3,
         query_text = $4,
         recommendation_filter = $5,
         remote_filter = $6,
         source_filter = $7,
         sort_mode = $8,
         include_hidden = $9,
         updated_at = $10::timestamptz,
         last_used_at = $11::timestamptz
       WHERE saved_search_id = $1 AND user_id = $2
       ${returningClause}`,
      [
        savedSearch.savedSearchId,
        savedSearch.userId,
        savedSearch.name,
        savedSearch.query.q,
        savedSearch.query.recommendation,
        savedSearch.query.remote,
        savedSearch.query.source,
        savedSearch.query.sort,
        savedSearch.query.includeHidden,
        savedSearch.updatedAt,
        savedSearch.lastUsedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('saved_search_update_failed');
    }

    return rowToSavedSearch(row);
  },

  async findSavedSearchById(userId, savedSearchId) {
    const result = await pool.query<SavedSearchRow>(
      `SELECT
         saved_search_id,
         user_id,
         name,
         query_text,
         recommendation_filter,
         remote_filter,
         source_filter,
         sort_mode,
         include_hidden,
         created_at::text,
         updated_at::text,
         last_used_at::text
       FROM user_saved_searches
       WHERE user_id = $1 AND saved_search_id = $2
       LIMIT 1`,
      [userId, savedSearchId],
    );

    const row = result.rows[0];
    return row ? rowToSavedSearch(row) : null;
  },

  async findSavedSearchByName(userId, name) {
    const result = await pool.query<SavedSearchRow>(
      `SELECT
         saved_search_id,
         user_id,
         name,
         query_text,
         recommendation_filter,
         remote_filter,
         source_filter,
         sort_mode,
         include_hidden,
         created_at::text,
         updated_at::text,
         last_used_at::text
       FROM user_saved_searches
       WHERE user_id = $1 AND lower(name) = lower($2)
       LIMIT 1`,
      [userId, name],
    );

    const row = result.rows[0];
    return row ? rowToSavedSearch(row) : null;
  },

  async listSavedSearches({ userId, limit }) {
    const result = await pool.query<SavedSearchRow>(
      `SELECT
         saved_search_id,
         user_id,
         name,
         query_text,
         recommendation_filter,
         remote_filter,
         source_filter,
         sort_mode,
         include_hidden,
         created_at::text,
         updated_at::text,
         last_used_at::text
       FROM user_saved_searches
       WHERE user_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return result.rows.map(rowToSavedSearch);
  },

  async deleteSavedSearch(userId, savedSearchId) {
    const result = await pool.query(
      `DELETE FROM user_saved_searches
       WHERE user_id = $1 AND saved_search_id = $2`,
      [userId, savedSearchId],
    );

    return (result.rowCount ?? 0) > 0;
  },
});
