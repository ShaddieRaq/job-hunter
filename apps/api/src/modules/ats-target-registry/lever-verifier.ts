import { z } from 'zod';

import type { AtsTargetVerificationResult, AtsTargetVerifier } from './verifier.js';

const defaultEndpointBaseUrl = 'https://api.lever.co/v0/postings';
const defaultTimeoutMs = 6000;

const leverProbeResponseSchema = z.array(z.unknown());

const normalizeIdentifierValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^[_-]+|[_-]+$/g, '');

const createTimeoutController = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeout),
  };
};

const toBaseResult = (options: {
  identifierValue: string;
  outcomeStatus: AtsTargetVerificationResult['outcomeStatus'];
  reasonCode: string;
  retryClass: AtsTargetVerificationResult['retryClass'];
  httpStatus: number | null;
  evidenceSummary: string;
}): AtsTargetVerificationResult => ({
  atsVendor: 'lever',
  identifierType: 'handle',
  identifierValue: options.identifierValue,
  outcomeStatus: options.outcomeStatus,
  reasonCode: options.reasonCode,
  retryClass: options.retryClass,
  httpStatus: options.httpStatus,
  evidenceSummary: options.evidenceSummary,
});

const classifyHttpStatus = (
  identifierValue: string,
  status: number,
): AtsTargetVerificationResult => {
  if (status === 429) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'pending',
      reasonCode: 'lever_rate_limited',
      retryClass: 'rate_limited',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  if (status === 408 || status === 425 || status >= 500) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'pending',
      reasonCode: 'lever_upstream_transient_error',
      retryClass: 'transient',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  if (status === 404) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'failed',
      reasonCode: 'lever_target_not_found',
      retryClass: 'none',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  if (status === 400) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'failed',
      reasonCode: 'lever_invalid_identifier',
      retryClass: 'none',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  if (status === 401 || status === 403) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'failed',
      reasonCode: 'lever_access_denied',
      retryClass: 'none',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  if (status >= 400 && status < 500) {
    return toBaseResult({
      identifierValue,
      outcomeStatus: 'failed',
      reasonCode: 'lever_client_error',
      retryClass: 'none',
      httpStatus: status,
      evidenceSummary: `lever_probe_status_${status}`,
    });
  }

  return toBaseResult({
    identifierValue,
    outcomeStatus: 'pending',
    reasonCode: 'lever_unknown_probe_failure',
    retryClass: 'transient',
    httpStatus: status,
    evidenceSummary: `lever_probe_status_${status}`,
  });
};

const parseJsonBody = async (
  response: Response,
): Promise<z.infer<typeof leverProbeResponseSchema> | null> => {
  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    return null;
  }

  const validated = leverProbeResponseSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
};

export interface CreateLeverTargetVerifierOptions {
  endpointBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const createLeverTargetVerifier = (
  options: CreateLeverTargetVerifierOptions = {},
): AtsTargetVerifier => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const endpointBaseUrl = options.endpointBaseUrl ?? defaultEndpointBaseUrl;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required for lever verifier');
  }

  return {
    async verifyIdentifier(identifierValue) {
      const normalized = normalizeIdentifierValue(identifierValue);
      if (normalized.length === 0) {
        return toBaseResult({
          identifierValue: normalized,
          outcomeStatus: 'failed',
          reasonCode: 'lever_invalid_identifier',
          retryClass: 'none',
          httpStatus: null,
          evidenceSummary: 'lever_identifier_normalization_empty',
        });
      }

      const endpoint = new URL(
        `${endpointBaseUrl.replace(/\/+$/g, '')}/${encodeURIComponent(normalized)}`,
      );
      endpoint.searchParams.set('mode', 'json');

      const timeoutController = createTimeoutController(timeoutMs);
      try {
        const response = await fetchImpl(endpoint.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
          signal: timeoutController.controller.signal,
        });

        if (response.status !== 200) {
          return classifyHttpStatus(normalized, response.status);
        }

        const parsedBody = await parseJsonBody(response);
        if (!parsedBody) {
          return toBaseResult({
            identifierValue: normalized,
            outcomeStatus: 'failed',
            reasonCode: 'lever_invalid_response_shape',
            retryClass: 'none',
            httpStatus: response.status,
            evidenceSummary: 'lever_response_parse_failed',
          });
        }

        return toBaseResult({
          identifierValue: normalized,
          outcomeStatus: 'verified',
          reasonCode: 'lever_public_board_verified',
          retryClass: 'none',
          httpStatus: response.status,
          evidenceSummary: `lever_postings_count_${parsedBody.length}`,
        });
      } catch (error) {
        if (
          (error instanceof Error && error.name === 'AbortError') ||
          (typeof DOMException !== 'undefined' && error instanceof DOMException)
        ) {
          return toBaseResult({
            identifierValue: normalized,
            outcomeStatus: 'pending',
            reasonCode: 'lever_probe_timeout',
            retryClass: 'transient',
            httpStatus: null,
            evidenceSummary: 'lever_fetch_timeout',
          });
        }

        return toBaseResult({
          identifierValue: normalized,
          outcomeStatus: 'pending',
          reasonCode: 'lever_probe_network_error',
          retryClass: 'transient',
          httpStatus: null,
          evidenceSummary: 'lever_fetch_network_error',
        });
      } finally {
        timeoutController.clear();
      }
    },
  };
};
