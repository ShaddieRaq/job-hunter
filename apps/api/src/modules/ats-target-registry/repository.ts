export const atsVendors = [
  'greenhouse',
  'lever',
  'workable',
  'ashby',
  'smartrecruiters',
  'recruitee',
] as const;

export type AtsVendor = (typeof atsVendors)[number];

export const atsTargetVerificationOutcomeStatuses = [
  'verified',
  'failed',
  'pending',
  'stale',
] as const;

export type AtsTargetVerificationOutcomeStatus =
  (typeof atsTargetVerificationOutcomeStatuses)[number];

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