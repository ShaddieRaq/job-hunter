import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeterministicAiProvider } from '../../src/modules/ai/deterministic-provider.js';
import { createAiService } from '../../src/modules/ai/service.js';
import {
  defaultAiEvalThresholds,
  evaluateAiEvalThresholds,
  runAiEval,
} from './ai-eval.js';

test('ai evaluation fixtures pass deterministic baseline thresholds', async () => {
  const service = createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });

  const summary = await runAiEval({
    service,
    userId: '8f2bc85b-0da9-48bb-8f42-d2894cc2b7be',
  });

  const failures = evaluateAiEvalThresholds(summary, defaultAiEvalThresholds);
  assert.deepEqual(failures, []);
});