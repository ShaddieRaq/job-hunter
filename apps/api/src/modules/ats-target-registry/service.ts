import { randomUUID } from 'node:crypto';

import type {
  AtsTargetCreateRequest,
  AtsTargetId,
  AtsTargetRecord,
  AtsTargetUpdateRequest,
  AtsTargetVerificationStatus,
  AtsVendor,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { createInMemoryAtsTargetRegistryRepository } from './in-memory-repository.js';
import type {
  AtsTargetRegistryPersistenceRepository,
  CompanyRegistryRecord,
} from './repository.js';

const defaultListLimit = 100;
const maxListLimit = 500;

type WriteAction = 'create_company' | 'update_company' | 'create_target' | 'update_target';

interface SourceProvenanceEnvelope {
  origin: string;
  audit: {
    actorUserId: string;
    writeAction: WriteAction;
    at: string;
  };
}

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.min(Math.max(1, limit), maxListLimit);
};

const normalizeOffset = (offset: number | undefined): number => {
  if (offset === undefined) {
    return 0;
  }

  return Math.max(0, offset);
};

const normalizeIdentifierValue = (value: string): string => value.trim().toLowerCase();

const normalizeCompanyName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSourceOrigin = (value: string | undefined): string => {
  if (!value) {
    return 'api_manual';
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized.length > 0 ? normalized.slice(0, 120) : 'api_manual';
};

const normalizeWebsiteDomain = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  let candidate = trimmed;

  if (candidate.includes('://')) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      candidate = trimmed;
    }
  }

  candidate = candidate.split('/')[0] ?? candidate;
  candidate = candidate.replace(/^www\./, '');
  candidate = candidate.trim();

  return candidate.length > 0 ? candidate : null;
};

const parseSourceProvenanceOrigin = (sourceProvenance: string): string | null => {
  try {
    const parsed = JSON.parse(sourceProvenance) as {
      origin?: unknown;
    };

    if (typeof parsed.origin === 'string' && parsed.origin.trim().length > 0) {
      return parsed.origin.trim().slice(0, 120);
    }
  } catch {
    return null;
  }

  return null;
};

const buildSourceProvenance = (options: {
  origin: string;
  actorUserId: string;
  writeAction: WriteAction;
  at: string;
}): string => {
  const envelope: SourceProvenanceEnvelope = {
    origin: options.origin,
    audit: {
      actorUserId: options.actorUserId,
      writeAction: options.writeAction,
      at: options.at,
    },
  };

  return JSON.stringify(envelope);
};

const hasAtLeastOneUpdateField = (input: AtsTargetUpdateRequest): boolean =>
  input.verificationStatus !== undefined ||
  input.verificationConfidence !== undefined ||
  input.verificationReason !== undefined ||
  input.lastVerifiedAt !== undefined ||
  input.nextVerificationAt !== undefined ||
  input.sourceProvenance !== undefined;

const resolveStatus = (
  input: AtsTargetCreateRequest,
): AtsTargetVerificationStatus => input.verificationStatus ?? 'pending';

const resolveCompanyForCreate = async (options: {
  repository: AtsTargetRegistryPersistenceRepository;
  canonicalName: string;
  websiteDomain: string | null;
  actorUserId: string;
  sourceOrigin: string;
  nowIso: string;
}): Promise<CompanyRegistryRecord> => {
  const normalizedName = normalizeCompanyName(options.canonicalName);
  const normalizedDomain = normalizeWebsiteDomain(options.websiteDomain);

  if (normalizedName.length === 0) {
    throw new HttpError(400, 'invalid_company_name');
  }

  let company =
    (normalizedDomain
      ? await options.repository.findCompanyByWebsiteDomain(normalizedDomain)
      : null) ?? (await options.repository.findCompanyByNormalizedName(normalizedName));

  if (!company) {
    return options.repository.createCompany({
      companyId: randomUUID(),
      canonicalName: options.canonicalName.trim(),
      normalizedName,
      websiteDomain: normalizedDomain,
      sourceProvenance: buildSourceProvenance({
        origin: options.sourceOrigin,
        actorUserId: options.actorUserId,
        writeAction: 'create_company',
        at: options.nowIso,
      }),
      createdAt: options.nowIso,
      updatedAt: options.nowIso,
    });
  }

  if (company.websiteDomain === null && normalizedDomain) {
    company = await options.repository.updateCompany({
      ...company,
      websiteDomain: normalizedDomain,
      sourceProvenance: buildSourceProvenance({
        origin: options.sourceOrigin,
        actorUserId: options.actorUserId,
        writeAction: 'update_company',
        at: options.nowIso,
      }),
      updatedAt: options.nowIso,
    });
  }

  return company;
};

export interface AtsTargetRegistryService {
  createAtsTarget(userId: string, input: AtsTargetCreateRequest): Promise<AtsTargetRecord>;
  listAtsTargets(options: {
    limit?: number;
    offset?: number;
    atsVendor?: AtsVendor;
    verificationStatus?: AtsTargetVerificationStatus;
  }): Promise<AtsTargetRecord[]>;
  updateAtsTarget(
    userId: string,
    targetId: AtsTargetId,
    input: AtsTargetUpdateRequest,
  ): Promise<AtsTargetRecord>;
}

export interface CreateAtsTargetRegistryServiceOptions {
  repository?: AtsTargetRegistryPersistenceRepository;
  now?: () => Date;
}

export const createAtsTargetRegistryService = ({
  repository = createInMemoryAtsTargetRegistryRepository(),
  now = () => new Date(),
}: CreateAtsTargetRegistryServiceOptions = {}): AtsTargetRegistryService => ({
  async createAtsTarget(userId, input) {
    const nowIso = now().toISOString();
    const sourceOrigin = normalizeSourceOrigin(
      input.sourceProvenance ?? input.company.sourceProvenance,
    );

    const company = await resolveCompanyForCreate({
      repository,
      canonicalName: input.company.canonicalName,
      websiteDomain: normalizeWebsiteDomain(input.company.websiteDomain),
      actorUserId: userId,
      sourceOrigin,
      nowIso,
    });

    const normalizedIdentifierValue = normalizeIdentifierValue(input.identifierValue);
    const existing = await repository.findAtsTargetByVendorIdentifier({
      atsVendor: input.atsVendor,
      identifierType: input.identifierType,
      identifierValue: normalizedIdentifierValue,
    });

    if (existing) {
      throw new HttpError(409, 'ats_target_identifier_exists', {
        atsVendor: input.atsVendor,
        identifierType: input.identifierType,
        identifierValue: normalizedIdentifierValue,
      });
    }

    return repository.createAtsTarget({
      targetId: randomUUID(),
      companyId: company.companyId,
      atsVendor: input.atsVendor,
      identifierType: input.identifierType,
      identifierValue: normalizedIdentifierValue,
      verificationStatus: resolveStatus(input),
      verificationConfidence: input.verificationConfidence ?? null,
      verificationReason: input.verificationReason ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      nextVerificationAt: input.nextVerificationAt ?? null,
      sourceProvenance: buildSourceProvenance({
        origin: sourceOrigin,
        actorUserId: userId,
        writeAction: 'create_target',
        at: nowIso,
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  },

  async listAtsTargets({ limit, offset, atsVendor, verificationStatus }) {
    return repository.listAtsTargets({
      limit: normalizeLimit(limit),
      offset: normalizeOffset(offset),
      atsVendor,
      verificationStatus,
    });
  },

  async updateAtsTarget(userId, targetId, input) {
    if (!hasAtLeastOneUpdateField(input)) {
      throw new HttpError(400, 'invalid_ats_target_update_payload', {
        details: 'at_least_one_field_required',
      });
    }

    const existing = await repository.findAtsTargetById(targetId);
    if (!existing) {
      throw new HttpError(404, 'ats_target_not_found', {
        targetId,
      });
    }

    const nowIso = now().toISOString();
    const sourceOrigin = normalizeSourceOrigin(
      input.sourceProvenance ??
        parseSourceProvenanceOrigin(existing.sourceProvenance) ??
        'api_manual',
    );

    return repository.updateAtsTarget({
      targetId: existing.targetId,
      companyId: existing.companyId,
      atsVendor: existing.atsVendor,
      identifierType: existing.identifierType,
      identifierValue: existing.identifierValue,
      verificationStatus: input.verificationStatus ?? existing.verificationStatus,
      verificationConfidence:
        input.verificationConfidence !== undefined
          ? input.verificationConfidence
          : existing.verificationConfidence,
      verificationReason:
        input.verificationReason !== undefined
          ? input.verificationReason
          : existing.verificationReason,
      lastVerifiedAt:
        input.lastVerifiedAt !== undefined
          ? input.lastVerifiedAt
          : existing.lastVerifiedAt,
      nextVerificationAt:
        input.nextVerificationAt !== undefined
          ? input.nextVerificationAt
          : existing.nextVerificationAt,
      sourceProvenance: buildSourceProvenance({
        origin: sourceOrigin,
        actorUserId: userId,
        writeAction: 'update_target',
        at: nowIso,
      }),
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    });
  },
});