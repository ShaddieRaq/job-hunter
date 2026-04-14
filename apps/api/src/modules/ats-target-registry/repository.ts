import type {
  AtsTargetCompany,
  AtsTargetId,
  AtsTargetIdentifierType,
  AtsTargetRecord,
  AtsTargetVerificationStatus,
  AtsVendor,
  CompanyRegistryId,
} from '@job-hunter/shared';

export type {
  AtsTargetId,
  AtsTargetIdentifierType,
  AtsTargetVerificationStatus,
  AtsVendor,
  CompanyRegistryId,
} from '@job-hunter/shared';

export type AtsTargetVerificationOutcomeStatus = AtsTargetVerificationStatus;

export interface CompanyRegistryRecord extends AtsTargetCompany {}

export type AtsTargetRegistryRecord = AtsTargetRecord;

export interface AtsTargetRegistryWriteRecord {
  targetId: AtsTargetId;
  companyId: CompanyRegistryId;
  atsVendor: AtsVendor;
  identifierType: AtsTargetIdentifierType;
  identifierValue: string;
  verificationStatus: AtsTargetVerificationStatus;
  verificationConfidence: number | null;
  verificationReason: string | null;
  lastVerifiedAt: string | null;
  nextVerificationAt: string | null;
  sourceProvenance: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRegistryRepository {
  createCompany(company: CompanyRegistryRecord): Promise<CompanyRegistryRecord>;
  updateCompany(company: CompanyRegistryRecord): Promise<CompanyRegistryRecord>;
  findCompanyById(companyId: CompanyRegistryId): Promise<CompanyRegistryRecord | null>;
  findCompanyByNormalizedName(
    normalizedName: string,
  ): Promise<CompanyRegistryRecord | null>;
  findCompanyByWebsiteDomain(
    websiteDomain: string,
  ): Promise<CompanyRegistryRecord | null>;
}

export interface AtsTargetRegistryRepository {
  createAtsTarget(target: AtsTargetRegistryWriteRecord): Promise<AtsTargetRegistryRecord>;
  updateAtsTarget(target: AtsTargetRegistryWriteRecord): Promise<AtsTargetRegistryRecord>;
  findAtsTargetById(targetId: AtsTargetId): Promise<AtsTargetRegistryRecord | null>;
  findAtsTargetByVendorIdentifier(options: {
    atsVendor: AtsVendor;
    identifierType: AtsTargetIdentifierType;
    identifierValue: string;
  }): Promise<AtsTargetRegistryRecord | null>;
  listAtsTargets(options: {
    limit: number;
    offset: number;
    atsVendor?: AtsVendor;
    verificationStatus?: AtsTargetVerificationStatus;
  }): Promise<AtsTargetRegistryRecord[]>;
}

export interface AtsTargetRegistryPersistenceRepository
  extends CompanyRegistryRepository,
    AtsTargetRegistryRepository {}

export interface AtsTargetVerificationEvent {
  eventId: string;
  targetId: string;
  attemptedAt: string;
  outcomeStatus: AtsTargetVerificationOutcomeStatus;
  httpStatus: number | null;
  errorCode: string | null;
  evidenceSummary: string;
}

export interface AtsTargetVerificationEventRepository {
  createVerificationEvent(
    event: AtsTargetVerificationEvent,
  ): Promise<AtsTargetVerificationEvent>;
  listVerificationEvents(options: {
    targetId?: string;
    atsVendor?: AtsVendor;
    limit: number;
    offset: number;
  }): Promise<AtsTargetVerificationEvent[]>;
}