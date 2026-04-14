import type {
  AtsTargetRegistryPersistenceRepository,
  AtsTargetRegistryRecord,
  AtsTargetRegistryWriteRecord,
  AtsTargetVerificationEvent,
  AtsTargetVerificationEventRepository,
  CompanyRegistryRecord,
  AtsVendor,
} from './repository.js';

interface InMemoryAtsTargetVerificationEventRepositoryOptions {
  resolveVendorByTargetId?: (targetId: string) => AtsVendor | null;
}

const companyNameKey = (normalizedName: string): string =>
  normalizedName.trim().toLowerCase();

const websiteDomainKey = (websiteDomain: string): string =>
  websiteDomain.trim().toLowerCase();

const vendorIdentifierKey = (target: {
  atsVendor: string;
  identifierType: string;
  identifierValue: string;
}): string =>
  `${target.atsVendor}:${target.identifierType}:${target.identifierValue
    .trim()
    .toLowerCase()}`;

const cloneCompany = (company: CompanyRegistryRecord): CompanyRegistryRecord => ({
  ...company,
});

const cloneTarget = (target: AtsTargetRegistryRecord): AtsTargetRegistryRecord => ({
  ...target,
  company: cloneCompany(target.company),
});

export const createInMemoryAtsTargetRegistryRepository = (): AtsTargetRegistryPersistenceRepository => {
  const companiesById = new Map<string, CompanyRegistryRecord>();
  const companyIdByNormalizedName = new Map<string, string>();
  const companyIdByWebsiteDomain = new Map<string, string>();
  const targetsById = new Map<string, AtsTargetRegistryWriteRecord>();
  const targetIdByVendorIdentifier = new Map<string, string>();

  const getCompany = (companyId: string): CompanyRegistryRecord => {
    const company = companiesById.get(companyId);
    if (!company) {
      throw new Error('company_not_found_for_target');
    }

    return company;
  };

  const hydrateTarget = (
    writeRecord: AtsTargetRegistryWriteRecord,
  ): AtsTargetRegistryRecord => ({
    ...writeRecord,
    company: cloneCompany(getCompany(writeRecord.companyId)),
  });

  return {
    async createCompany(company) {
      if (companiesById.has(company.companyId)) {
        throw new Error('company_insert_failed_duplicate_company_id');
      }

      const normalizedNameLookup = companyNameKey(company.normalizedName);
      const normalizedNameOwner = companyIdByNormalizedName.get(normalizedNameLookup);
      if (normalizedNameOwner && normalizedNameOwner !== company.companyId) {
        throw new Error('company_insert_failed_duplicate_normalized_name');
      }

      const websiteDomainLookup = company.websiteDomain
        ? websiteDomainKey(company.websiteDomain)
        : null;
      if (websiteDomainLookup) {
        const websiteDomainOwner = companyIdByWebsiteDomain.get(websiteDomainLookup);
        if (websiteDomainOwner && websiteDomainOwner !== company.companyId) {
          throw new Error('company_insert_failed_duplicate_website_domain');
        }

        companyIdByWebsiteDomain.set(websiteDomainLookup, company.companyId);
      }

      companiesById.set(company.companyId, cloneCompany(company));
      companyIdByNormalizedName.set(normalizedNameLookup, company.companyId);
      return cloneCompany(company);
    },

    async updateCompany(company) {
      const existing = companiesById.get(company.companyId);
      if (!existing) {
        throw new Error('company_update_failed_not_found');
      }

      const existingNameLookup = companyNameKey(existing.normalizedName);
      const nextNameLookup = companyNameKey(company.normalizedName);

      if (existingNameLookup !== nextNameLookup) {
        const nextNameOwner = companyIdByNormalizedName.get(nextNameLookup);
        if (nextNameOwner && nextNameOwner !== company.companyId) {
          throw new Error('company_update_failed_duplicate_normalized_name');
        }

        companyIdByNormalizedName.delete(existingNameLookup);
        companyIdByNormalizedName.set(nextNameLookup, company.companyId);
      }

      const existingDomainLookup = existing.websiteDomain
        ? websiteDomainKey(existing.websiteDomain)
        : null;
      const nextDomainLookup = company.websiteDomain
        ? websiteDomainKey(company.websiteDomain)
        : null;

      if (existingDomainLookup !== nextDomainLookup) {
        if (existingDomainLookup) {
          companyIdByWebsiteDomain.delete(existingDomainLookup);
        }

        if (nextDomainLookup) {
          const nextDomainOwner = companyIdByWebsiteDomain.get(nextDomainLookup);
          if (nextDomainOwner && nextDomainOwner !== company.companyId) {
            throw new Error('company_update_failed_duplicate_website_domain');
          }

          companyIdByWebsiteDomain.set(nextDomainLookup, company.companyId);
        }
      }

      companiesById.set(company.companyId, cloneCompany(company));
      return cloneCompany(company);
    },

    async findCompanyById(companyId) {
      const company = companiesById.get(companyId);
      return company ? cloneCompany(company) : null;
    },

    async findCompanyByNormalizedName(normalizedName) {
      const companyId = companyIdByNormalizedName.get(companyNameKey(normalizedName));
      if (!companyId) {
        return null;
      }

      const company = companiesById.get(companyId);
      return company ? cloneCompany(company) : null;
    },

    async findCompanyByWebsiteDomain(websiteDomain) {
      const companyId = companyIdByWebsiteDomain.get(websiteDomainKey(websiteDomain));
      if (!companyId) {
        return null;
      }

      const company = companiesById.get(companyId);
      return company ? cloneCompany(company) : null;
    },

    async createAtsTarget(target) {
      const key = vendorIdentifierKey(target);
      if (targetsById.has(target.targetId)) {
        throw new Error('ats_target_insert_failed_duplicate_target_id');
      }

      const existingByVendorIdentifier = targetIdByVendorIdentifier.get(key);
      if (existingByVendorIdentifier && existingByVendorIdentifier !== target.targetId) {
        throw new Error('ats_target_insert_failed_duplicate_vendor_identifier');
      }

      getCompany(target.companyId);

      targetsById.set(target.targetId, {
        ...target,
      });
      targetIdByVendorIdentifier.set(key, target.targetId);
      return cloneTarget(hydrateTarget(target));
    },

    async updateAtsTarget(target) {
      const existing = targetsById.get(target.targetId);
      if (!existing) {
        throw new Error('ats_target_update_failed_not_found');
      }

      const previousKey = vendorIdentifierKey(existing);
      const nextKey = vendorIdentifierKey(target);
      if (previousKey !== nextKey) {
        const existingByVendorIdentifier = targetIdByVendorIdentifier.get(nextKey);
        if (existingByVendorIdentifier && existingByVendorIdentifier !== target.targetId) {
          throw new Error('ats_target_update_failed_duplicate_vendor_identifier');
        }

        targetIdByVendorIdentifier.delete(previousKey);
        targetIdByVendorIdentifier.set(nextKey, target.targetId);
      }

      getCompany(target.companyId);
      targetsById.set(target.targetId, {
        ...target,
      });
      return cloneTarget(hydrateTarget(target));
    },

    async findAtsTargetById(targetId) {
      const target = targetsById.get(targetId);
      if (!target) {
        return null;
      }

      return cloneTarget(hydrateTarget(target));
    },

    async findAtsTargetByVendorIdentifier({
      atsVendor,
      identifierType,
      identifierValue,
    }) {
      const targetId = targetIdByVendorIdentifier.get(
        vendorIdentifierKey({ atsVendor, identifierType, identifierValue }),
      );
      if (!targetId) {
        return null;
      }

      const target = targetsById.get(targetId);
      if (!target) {
        return null;
      }

      return cloneTarget(hydrateTarget(target));
    },

    async listAtsTargets({ limit, offset, atsVendor, verificationStatus }) {
      const normalizedLimit = Math.max(0, limit);
      const normalizedOffset = Math.max(0, offset);

      return [...targetsById.values()]
        .filter((target) => (atsVendor ? target.atsVendor === atsVendor : true))
        .filter((target) =>
          verificationStatus ? target.verificationStatus === verificationStatus : true,
        )
        .sort((left, right) => {
          if (left.updatedAt !== right.updatedAt) {
            return right.updatedAt.localeCompare(left.updatedAt);
          }

          if (left.createdAt !== right.createdAt) {
            return right.createdAt.localeCompare(left.createdAt);
          }

          return right.targetId.localeCompare(left.targetId);
        })
        .slice(normalizedOffset, normalizedOffset + normalizedLimit)
        .map((target) => cloneTarget(hydrateTarget(target)));
    },
  };
};

const cloneVerificationEvent = (
  event: AtsTargetVerificationEvent,
): AtsTargetVerificationEvent => ({
  ...event,
});

export const createInMemoryAtsTargetVerificationEventRepository = (
  options: InMemoryAtsTargetVerificationEventRepositoryOptions = {},
): AtsTargetVerificationEventRepository => {
  const eventsById = new Map<string, AtsTargetVerificationEvent>();

  return {
    async createVerificationEvent(event) {
      if (eventsById.has(event.eventId)) {
        throw new Error('verification_event_insert_failed_duplicate_event_id');
      }

      eventsById.set(event.eventId, cloneVerificationEvent(event));
      return cloneVerificationEvent(event);
    },

    async listVerificationEvents({ targetId, atsVendor, limit, offset }) {
      const normalizedLimit = Math.max(0, limit);
      const normalizedOffset = Math.max(0, offset);

      return [...eventsById.values()]
        .filter((event) => (targetId ? event.targetId === targetId : true))
        .filter((event) => {
          if (!atsVendor) {
            return true;
          }

          const resolvedVendor = options.resolveVendorByTargetId?.(event.targetId);
          return resolvedVendor === atsVendor;
        })
        .sort((left, right) => {
          if (left.attemptedAt !== right.attemptedAt) {
            return right.attemptedAt.localeCompare(left.attemptedAt);
          }

          return right.eventId.localeCompare(left.eventId);
        })
        .slice(normalizedOffset, normalizedOffset + normalizedLimit)
        .map(cloneVerificationEvent);
    },
  };
};