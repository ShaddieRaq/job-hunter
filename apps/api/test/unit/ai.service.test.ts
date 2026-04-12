import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createAiService } from '../../src/modules/ai/service.js';

test('extractResume returns structured deterministic fields', () => {
  const service = createAiService();
  const userId = randomUUID();

  const result = service.extractResume(userId, {
    rawText:
      'Senior Software Engineer with 6 years experience. Skills: TypeScript, Node.js, AWS. Looking for remote roles in fintech.',
  });

  assert.equal(result.userId, userId);
  assert.equal(result.extraction.inferredSeniority, 'senior');
  assert.equal(result.extraction.yearsExperience.minimum, 6);
  assert.ok(result.extraction.normalizedSkills.includes('TypeScript'));
  assert.ok(result.extraction.domains.includes('fintech'));
  assert.equal(result.extraction.remotePreference, 'remote');
});

test('explainMatch returns skip when deal breakers exist', () => {
  const service = createAiService();

  const result = service.explainMatch({
    userId: randomUUID(),
    canonicalJobId: randomUUID(),
    scoreBreakdown: {
      overallScore: 90,
      titleScore: 90,
      skillScore: 90,
      seniorityScore: 90,
      locationScore: 90,
      compensationScore: 90,
      domainScore: 90,
      requirementScore: 90,
      trajectoryScore: 90,
      penaltyScore: 0,
    },
    strengths: ['Strong TypeScript alignment'],
    gaps: [],
    dealBreakers: ['Requires in-office five days'],
  });

  assert.equal(result.explanation.recommendation, 'skip');
  assert.equal(result.explanation.dealBreakers.length, 1);
});
