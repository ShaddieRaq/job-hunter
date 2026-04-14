import type { PostgresPool } from '../../db/postgres.js';
import type {
  AtsTargetRegistryPersistenceRepository,
  AtsTargetRegistryRecord,
  AtsTargetVerificationStatus,
  AtsVendor,
  AtsTargetVerificationEvent,
  AtsTargetVerificationEventRepository,
  CompanyRegistryRecord,
} from './repository.js';

interface CompanyRegistryRow {
  company_id: string;
  canonical_name: string;
  normalized_name: string;
  website_domain: string | null;
  source_provenance: string;
  created_at: string;
  updated_at: string;
}

interface AtsTargetRegistryRow {
  target_id: string;
  company_id: string;
  ats_vendor: AtsVendor;
  identifier_type: AtsTargetRegistryRecord['identifierType'];
  identifier_value: string;
  verification_status: AtsTargetVerificationStatus;
  verification_confidence: number | null;
  verification_reason: string | null;
  last_verified_at: string | null;
  next_verification_at: string | null;
  source_provenance: string;
  created_at: string;
  updated_at: string;
  company_company_id: string;
  company_canonical_name: string;
  company_normalized_name: string;
  company_website_domain: string | null;
  company_source_provenance: string;
  company_created_at: string;
  company_updated_at: string;
}

const rowToCompany = (row: CompanyRegistryRow): CompanyRegistryRecord => ({
  companyId: row.company_id,
  canonicalName: row.canonical_name,
  normalizedName: row.normalized_name,
  websiteDomain: row.website_domain,
  sourceProvenance: row.source_provenance,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToAtsTarget = (row: AtsTargetRegistryRow): AtsTargetRegistryRecord => ({
  targetId: row.target_id,
  companyId: row.company_id,
  atsVendor: row.ats_vendor,
  identifierType: row.identifier_type,
  identifierValue: row.identifier_value,
  verificationStatus: row.verification_status,
  verificationConfidence: row.verification_confidence,
  verificationReason: row.verification_reason,
  lastVerifiedAt: row.last_verified_at,
  nextVerificationAt: row.next_verification_at,
  sourceProvenance: row.source_provenance,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  company: {
    companyId: row.company_company_id,
    canonicalName: row.company_canonical_name,
    normalizedName: row.company_normalized_name,
    websiteDomain: row.company_website_domain,
    sourceProvenance: row.company_source_provenance,
    createdAt: row.company_created_at,
    updatedAt: row.company_updated_at,
  },
});

const companyReturningClause = `RETURNING
  company_id,
  canonical_name,
  normalized_name,
  website_domain,
  source_provenance,
  created_at::text,
  updated_at::text`;

const atsTargetSelectClause = `SELECT
  targets.target_id,
  targets.company_id,
  targets.ats_vendor,
  targets.identifier_type,
  targets.identifier_value,
  targets.verification_status,
  targets.verification_confidence,
  targets.verification_reason,
  targets.last_verified_at::text,
  targets.next_verification_at::text,
  targets.source_provenance,
  targets.created_at::text,
  targets.updated_at::text,
  companies.company_id AS company_company_id,
  companies.canonical_name AS company_canonical_name,
  companies.normalized_name AS company_normalized_name,
  companies.website_domain AS company_website_domain,
  companies.source_provenance AS company_source_provenance,
  companies.created_at::text AS company_created_at,
  companies.updated_at::text AS company_updated_at
FROM ats_target_registry AS targets
INNER JOIN company_registry AS companies
  ON companies.company_id = targets.company_id`;

const loadTargetById = async (
  pool: PostgresPool,
  targetId: string,
): Promise<AtsTargetRegistryRecord | null> => {
  const result = await pool.query<AtsTargetRegistryRow>(
    `${atsTargetSelectClause}
     WHERE targets.target_id = $1::uuid
     LIMIT 1`,
    [targetId],
  );

  const row = result.rows[0];
  return row ? rowToAtsTarget(row) : null;
};

export const createPostgresAtsTargetRegistryRepository = (
  pool: PostgresPool,
): AtsTargetRegistryPersistenceRepository => ({
  async createCompany(company) {
    const result = await pool.query<CompanyRegistryRow>(
      `INSERT INTO company_registry (
         company_id,
         canonical_name,
         normalized_name,
         website_domain,
         source_provenance,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6::timestamptz,
         $7::timestamptz
       )
       ${companyReturningClause}`,
      [
        company.companyId,
        company.canonicalName,
        company.normalizedName,
        company.websiteDomain,
        company.sourceProvenance,
        company.createdAt,
        company.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('company_insert_failed');
    }

    return rowToCompany(row);
  },

  async updateCompany(company) {
    const result = await pool.query<CompanyRegistryRow>(
      `UPDATE company_registry
       SET
         canonical_name = $2,
         normalized_name = $3,
         website_domain = $4,
         source_provenance = $5,
         updated_at = $6::timestamptz
       WHERE company_id = $1::uuid
       ${companyReturningClause}`,
      [
        company.companyId,
        company.canonicalName,
        company.normalizedName,
        company.websiteDomain,
        company.sourceProvenance,
        company.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('company_update_failed');
    }

    return rowToCompany(row);
  },

  async findCompanyById(companyId) {
    const result = await pool.query<CompanyRegistryRow>(
      `SELECT
         company_id,
         canonical_name,
         normalized_name,
         website_domain,
         source_provenance,
         created_at::text,
         updated_at::text
       FROM company_registry
       WHERE company_id = $1::uuid
       LIMIT 1`,
      [companyId],
    );

    const row = result.rows[0];
    return row ? rowToCompany(row) : null;
  },

  async findCompanyByNormalizedName(normalizedName) {
    const result = await pool.query<CompanyRegistryRow>(
      `SELECT
         company_id,
         canonical_name,
         normalized_name,
         website_domain,
         source_provenance,
         created_at::text,
         updated_at::text
       FROM company_registry
       WHERE lower(normalized_name) = lower($1)
       LIMIT 1`,
      [normalizedName],
    );

    const row = result.rows[0];
    return row ? rowToCompany(row) : null;
  },

  async findCompanyByWebsiteDomain(websiteDomain) {
    const result = await pool.query<CompanyRegistryRow>(
      `SELECT
         company_id,
         canonical_name,
         normalized_name,
         website_domain,
         source_provenance,
         created_at::text,
         updated_at::text
       FROM company_registry
       WHERE lower(website_domain) = lower($1)
       LIMIT 1`,
      [websiteDomain],
    );

    const row = result.rows[0];
    return row ? rowToCompany(row) : null;
  },

  async createAtsTarget(target) {
    const result = await pool.query<{ target_id: string }>(
      `INSERT INTO ats_target_registry (
         target_id,
         company_id,
         ats_vendor,
         identifier_type,
         identifier_value,
         verification_status,
         verification_confidence,
         verification_reason,
         last_verified_at,
         next_verification_at,
         source_provenance,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2::uuid,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9::timestamptz,
         $10::timestamptz,
         $11,
         $12::timestamptz,
         $13::timestamptz
       )
       RETURNING target_id`,
      [
        target.targetId,
        target.companyId,
        target.atsVendor,
        target.identifierType,
        target.identifierValue,
        target.verificationStatus,
        target.verificationConfidence,
        target.verificationReason,
        target.lastVerifiedAt,
        target.nextVerificationAt,
        target.sourceProvenance,
        target.createdAt,
        target.updatedAt,
      ],
    );

    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('ats_target_insert_failed');
    }

    const loaded = await loadTargetById(pool, inserted.target_id);
    if (!loaded) {
      throw new Error('ats_target_insert_failed_reload');
    }

    return loaded;
  },

  async updateAtsTarget(target) {
    const result = await pool.query<{ target_id: string }>(
      `UPDATE ats_target_registry
       SET
         company_id = $2::uuid,
         ats_vendor = $3,
         identifier_type = $4,
         identifier_value = $5,
         verification_status = $6,
         verification_confidence = $7,
         verification_reason = $8,
         last_verified_at = $9::timestamptz,
         next_verification_at = $10::timestamptz,
         source_provenance = $11,
         updated_at = $12::timestamptz
       WHERE target_id = $1::uuid
       RETURNING target_id`,
      [
        target.targetId,
        target.companyId,
        target.atsVendor,
        target.identifierType,
        target.identifierValue,
        target.verificationStatus,
        target.verificationConfidence,
        target.verificationReason,
        target.lastVerifiedAt,
        target.nextVerificationAt,
        target.sourceProvenance,
        target.updatedAt,
      ],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new Error('ats_target_update_failed');
    }

    const loaded = await loadTargetById(pool, updated.target_id);
    if (!loaded) {
      throw new Error('ats_target_update_failed_reload');
    }

    return loaded;
  },

  async findAtsTargetById(targetId) {
    return loadTargetById(pool, targetId);
  },

  async findAtsTargetByVendorIdentifier({
    atsVendor,
    identifierType,
    identifierValue,
  }) {
    const result = await pool.query<AtsTargetRegistryRow>(
      `${atsTargetSelectClause}
       WHERE targets.ats_vendor = $1
         AND targets.identifier_type = $2
         AND lower(targets.identifier_value) = lower($3)
       LIMIT 1`,
      [atsVendor, identifierType, identifierValue],
    );

    const row = result.rows[0];
    return row ? rowToAtsTarget(row) : null;
  },

  async listAtsTargets({ limit, offset, atsVendor, verificationStatus }) {
    const normalizedLimit = Math.max(0, limit);
    const normalizedOffset = Math.max(0, offset);

    const result = await pool.query<AtsTargetRegistryRow>(
      `${atsTargetSelectClause}
       WHERE ($1::text IS NULL OR targets.ats_vendor = $1)
         AND ($2::text IS NULL OR targets.verification_status = $2)
       ORDER BY targets.updated_at DESC, targets.created_at DESC, targets.target_id DESC
       LIMIT $3 OFFSET $4`,
      [atsVendor ?? null, verificationStatus ?? null, normalizedLimit, normalizedOffset],
    );

    return result.rows.map(rowToAtsTarget);
  },
});

interface AtsTargetVerificationEventRow {
  event_id: string;
  target_id: string;
  attempted_at: string;
  outcome_status: AtsTargetVerificationEvent['outcomeStatus'];
  http_status: number | null;
  error_code: string | null;
  evidence_summary: string;
}

const rowToVerificationEvent = (
  row: AtsTargetVerificationEventRow,
): AtsTargetVerificationEvent => ({
  eventId: row.event_id,
  targetId: row.target_id,
  attemptedAt: row.attempted_at,
  outcomeStatus: row.outcome_status,
  httpStatus: row.http_status,
  errorCode: row.error_code,
  evidenceSummary: row.evidence_summary,
});

export const createPostgresAtsTargetVerificationEventRepository = (
  pool: PostgresPool,
): AtsTargetVerificationEventRepository => ({
  async createVerificationEvent(event) {
    const result = await pool.query<AtsTargetVerificationEventRow>(
      `INSERT INTO ats_target_verification_events (
         event_id,
         target_id,
         attempted_at,
         outcome_status,
         http_status,
         error_code,
         evidence_summary
       ) VALUES (
         $1,
         $2,
         $3::timestamptz,
         $4,
         $5,
         $6,
         $7
       )
       RETURNING
         event_id,
         target_id,
         attempted_at::text,
         outcome_status,
         http_status,
         error_code,
         evidence_summary`,
      [
        event.eventId,
        event.targetId,
        event.attemptedAt,
        event.outcomeStatus,
        event.httpStatus,
        event.errorCode,
        event.evidenceSummary,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('verification_event_insert_failed');
    }

    return rowToVerificationEvent(row);
  },

  async listVerificationEvents({ targetId, atsVendor, limit, offset }) {
    const normalizedLimit = Math.max(0, limit);
    const normalizedOffset = Math.max(0, offset);

    const result = await pool.query<AtsTargetVerificationEventRow>(
      `SELECT
         events.event_id,
         events.target_id,
         events.attempted_at::text,
         events.outcome_status,
         events.http_status,
         events.error_code,
         events.evidence_summary
       FROM ats_target_verification_events AS events
       INNER JOIN ats_target_registry AS targets
         ON targets.target_id = events.target_id
       WHERE ($1::uuid IS NULL OR events.target_id = $1::uuid)
         AND ($2::text IS NULL OR targets.ats_vendor = $2)
       ORDER BY events.attempted_at DESC, events.event_id DESC
       LIMIT $3 OFFSET $4`,
      [targetId ?? null, atsVendor ?? null, normalizedLimit, normalizedOffset],
    );

    return result.rows.map(rowToVerificationEvent);
  },
});