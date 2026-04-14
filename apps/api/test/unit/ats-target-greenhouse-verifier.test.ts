import assert from 'node:assert/strict';
import test from 'node:test';

import { createGreenhouseTargetVerifier } from '../../src/modules/ats-target-registry/greenhouse-verifier.js';

const createFetchWithJson = (
  payload: unknown,
  options: { status?: number; statusText?: string } = {},
): typeof fetch =>
  async () =>
    new Response(JSON.stringify(payload), {
      status: options.status ?? 200,
      statusText: options.statusText ?? 'OK',
      headers: {
        'content-type': 'application/json',
      },
    });

test('greenhouse verifier marks reachable public board as verified', async () => {
  const verifier = createGreenhouseTargetVerifier({
    fetchImpl: createFetchWithJson({ jobs: [{ id: 1 }] }),
  });

  const result = await verifier.verifyIdentifier('Acme-Labs');

  assert.equal(result.atsVendor, 'greenhouse');
  assert.equal(result.identifierType, 'board_token');
  assert.equal(result.identifierValue, 'acme-labs');
  assert.equal(result.outcomeStatus, 'verified');
  assert.equal(result.reasonCode, 'greenhouse_public_board_verified');
  assert.equal(result.retryClass, 'none');
  assert.equal(result.httpStatus, 200);
});

test('greenhouse verifier classifies 404 as definitive failed with non-retry', async () => {
  const verifier = createGreenhouseTargetVerifier({
    fetchImpl: createFetchWithJson({ message: 'not found' }, { status: 404 }),
  });

  const result = await verifier.verifyIdentifier('missing-board');

  assert.equal(result.outcomeStatus, 'failed');
  assert.equal(result.reasonCode, 'greenhouse_target_not_found');
  assert.equal(result.retryClass, 'none');
  assert.equal(result.httpStatus, 404);
});

test('greenhouse verifier classifies rate-limited responses as retryable pending', async () => {
  const verifier = createGreenhouseTargetVerifier({
    fetchImpl: createFetchWithJson({ message: 'rate limited' }, { status: 429 }),
  });

  const result = await verifier.verifyIdentifier('acme-board');

  assert.equal(result.outcomeStatus, 'pending');
  assert.equal(result.reasonCode, 'greenhouse_rate_limited');
  assert.equal(result.retryClass, 'rate_limited');
  assert.equal(result.httpStatus, 429);
});

test('greenhouse verifier classifies upstream 5xx as retryable pending', async () => {
  const verifier = createGreenhouseTargetVerifier({
    fetchImpl: createFetchWithJson({ message: 'unavailable' }, { status: 503 }),
  });

  const result = await verifier.verifyIdentifier('acme-board');

  assert.equal(result.outcomeStatus, 'pending');
  assert.equal(result.reasonCode, 'greenhouse_upstream_transient_error');
  assert.equal(result.retryClass, 'transient');
  assert.equal(result.httpStatus, 503);
});

test('greenhouse verifier classifies invalid 200 payload as failed non-verified', async () => {
  const verifier = createGreenhouseTargetVerifier({
    fetchImpl: createFetchWithJson({ postings: [] }, { status: 200 }),
  });

  const result = await verifier.verifyIdentifier('acme-board');

  assert.equal(result.outcomeStatus, 'failed');
  assert.equal(result.reasonCode, 'greenhouse_invalid_response_shape');
  assert.equal(result.retryClass, 'none');
  assert.equal(result.httpStatus, 200);
});

test('greenhouse verifier classifies abort and network errors as retryable pending', async () => {
  const abortingFetch: typeof fetch = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  const networkingFetch: typeof fetch = async () => {
    throw new Error('socket hang up');
  };

  const timeoutVerifier = createGreenhouseTargetVerifier({
    fetchImpl: abortingFetch,
  });
  const networkVerifier = createGreenhouseTargetVerifier({
    fetchImpl: networkingFetch,
  });

  const timeoutResult = await timeoutVerifier.verifyIdentifier('acme-board');
  const networkResult = await networkVerifier.verifyIdentifier('acme-board');

  assert.equal(timeoutResult.outcomeStatus, 'pending');
  assert.equal(timeoutResult.reasonCode, 'greenhouse_probe_timeout');
  assert.equal(timeoutResult.retryClass, 'transient');
  assert.equal(timeoutResult.httpStatus, null);

  assert.equal(networkResult.outcomeStatus, 'pending');
  assert.equal(networkResult.reasonCode, 'greenhouse_probe_network_error');
  assert.equal(networkResult.retryClass, 'transient');
  assert.equal(networkResult.httpStatus, null);
});
