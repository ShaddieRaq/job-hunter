import type {
  AtsTargetVerificationOutcomeStatus,
  AtsVendor,
} from './repository.js';

export const atsTargetVerificationRetryClasses = [
  'none',
  'transient',
  'rate_limited',
] as const;

export type AtsTargetVerificationRetryClass =
  (typeof atsTargetVerificationRetryClasses)[number];

export interface AtsTargetVerificationResult {
  atsVendor: AtsVendor;
  identifierType: 'board_token' | 'handle' | 'subdomain' | 'slug';
  identifierValue: string;
  outcomeStatus: AtsTargetVerificationOutcomeStatus;
  reasonCode: string;
  retryClass: AtsTargetVerificationRetryClass;
  httpStatus: number | null;
  evidenceSummary: string;
}

export interface AtsTargetVerifier {
  verifyIdentifier(identifierValue: string): Promise<AtsTargetVerificationResult>;
}
