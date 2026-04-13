import type {
  JobExtractionRequest,
  MatchExplanationRequest,
  ResumeExtractionRequest,
} from '@job-hunter/shared';

export const maxProviderRawTextLength = 50_000;
const maxEvidenceItemLength = 240;
export const redactionMarker = '[redacted]';
export const truncatedMarker = '\n\n[truncated_for_privacy]';

export const providerScopedUserId = '00000000-0000-0000-0000-000000000000';

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?:\+?\d[\d().\s-]{6,}\d)/g;
const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
const urlPattern = /\bhttps?:\/\/[^\s)]+/gi;

const applyRedactions = (value: string): string =>
  value
    .replace(emailPattern, redactionMarker)
    .replace(phonePattern, redactionMarker)
    .replace(ssnPattern, redactionMarker)
    .replace(urlPattern, redactionMarker);

const truncateForProvider = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const limit = Math.max(1, maxLength - truncatedMarker.length);
  return `${value.slice(0, limit)}${truncatedMarker}`;
};

export const sanitizeTextForProvider = (
  value: string,
  maxLength: number = maxProviderRawTextLength,
): string => truncateForProvider(applyRedactions(value.trim()), maxLength);

const sanitizeEvidenceList = (values: string[]): string[] =>
  values
    .map((value) => sanitizeTextForProvider(value, maxEvidenceItemLength).trim())
    .filter((value) => value.length > 0);

export const sanitizeResumeExtractionPayloadForProvider = (
  payload: ResumeExtractionRequest,
): ResumeExtractionRequest => ({
  rawText: sanitizeTextForProvider(payload.rawText),
});

export const sanitizeJobExtractionPayloadForProvider = (
  payload: JobExtractionRequest,
): JobExtractionRequest => ({
  rawText: sanitizeTextForProvider(payload.rawText),
  sourceName: payload.sourceName
    ? sanitizeTextForProvider(payload.sourceName, 120) || undefined
    : undefined,
});

export const sanitizeMatchExplanationRequestForProvider = (
  payload: MatchExplanationRequest,
): MatchExplanationRequest => ({
  userId: providerScopedUserId,
  canonicalJobId: payload.canonicalJobId,
  scoreBreakdown: payload.scoreBreakdown,
  strengths: sanitizeEvidenceList(payload.strengths),
  gaps: sanitizeEvidenceList(payload.gaps),
  dealBreakers: sanitizeEvidenceList(payload.dealBreakers),
});
