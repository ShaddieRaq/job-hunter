import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { createDeterministicAiProvider } from '../../src/modules/ai/deterministic-provider.js';
import { createAiService, type AiService } from '../../src/modules/ai/service.js';
import {
  jobExtractionFixtures,
  matchExplanationFixtures,
  resumeExtractionFixtures,
} from '../fixtures/ai-eval-fixtures.js';

interface SetScoreCounts {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}

interface SetScoreSummary extends SetScoreCounts {
  precision: number;
  recall: number;
}

interface ScalarAccuracySummary {
  correct: number;
  total: number;
  accuracy: number;
}

export interface ExtractionEvalSummary {
  resumeSkills: SetScoreSummary;
  resumeDomains: SetScoreSummary;
  resumeSeniority: ScalarAccuracySummary;
  resumeRemotePreference: ScalarAccuracySummary;
  resumeYearsExperience: ScalarAccuracySummary;
  jobSkills: SetScoreSummary;
  jobRequiredSkills: SetScoreSummary;
  jobDomains: SetScoreSummary;
  jobSeniority: ScalarAccuracySummary;
  jobRemoteType: ScalarAccuracySummary;
  jobYearsExperience: ScalarAccuracySummary;
}

export interface ExplanationEvalSummary {
  total: number;
  recommendationCorrect: number;
  recommendationAccuracy: number;
  unsupportedClaims: number;
  unsupportedClaimRate: number;
  evidenceMismatches: number;
  evidenceMismatchRate: number;
  missingEvidenceSignals: number;
  missingEvidenceSignalRate: number;
}

export interface AiEvalSummary {
  extraction: ExtractionEvalSummary;
  explanation: ExplanationEvalSummary;
  generatedAt: string;
}

export interface AiEvalThresholds {
  minSetPrecision: number;
  minSetRecall: number;
  minScalarAccuracy: number;
  minRecommendationAccuracy: number;
  maxUnsupportedClaimRate: number;
  maxEvidenceMismatchRate: number;
  maxMissingEvidenceSignalRate: number;
}

export const defaultAiEvalThresholds: AiEvalThresholds = {
  minSetPrecision: 0.8,
  minSetRecall: 0.8,
  minScalarAccuracy: 1,
  minRecommendationAccuracy: 1,
  maxUnsupportedClaimRate: 0,
  maxEvidenceMismatchRate: 0,
  maxMissingEvidenceSignalRate: 0,
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const buildSet = (values: string[]): Set<string> =>
  new Set(values.map((value) => normalizeText(value)));

const addSetScores = (
  counts: SetScoreCounts,
  expectedValues: string[],
  actualValues: string[],
): void => {
  const expected = buildSet(expectedValues);
  const actual = buildSet(actualValues);

  for (const value of actual) {
    if (expected.has(value)) {
      counts.truePositive += 1;
    } else {
      counts.falsePositive += 1;
    }
  }

  for (const value of expected) {
    if (!actual.has(value)) {
      counts.falseNegative += 1;
    }
  }
};

const finalizeSetScores = (counts: SetScoreCounts): SetScoreSummary => {
  const predictedPositive = counts.truePositive + counts.falsePositive;
  const expectedPositive = counts.truePositive + counts.falseNegative;

  return {
    ...counts,
    precision: predictedPositive === 0 ? 1 : counts.truePositive / predictedPositive,
    recall: expectedPositive === 0 ? 1 : counts.truePositive / expectedPositive,
  };
};

const finalizeScalarAccuracy = (
  correct: number,
  total: number,
): ScalarAccuracySummary => ({
  correct,
  total,
  accuracy: total === 0 ? 1 : correct / total,
});

const evaluateExtraction = async (
  service: AiService,
  userId: string,
): Promise<ExtractionEvalSummary> => {
  const resumeSkills: SetScoreCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
  const resumeDomains: SetScoreCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
  let resumeSeniorityCorrect = 0;
  let resumeRemotePreferenceCorrect = 0;
  let resumeYearsCorrect = 0;

  for (const fixture of resumeExtractionFixtures) {
    const response = await service.extractResume(userId, fixture.request);

    addSetScores(
      resumeSkills,
      fixture.expected.normalizedSkills,
      response.extraction.normalizedSkills,
    );
    addSetScores(resumeDomains, fixture.expected.domains, response.extraction.domains);

    if (response.extraction.inferredSeniority === fixture.expected.inferredSeniority) {
      resumeSeniorityCorrect += 1;
    }

    if (response.extraction.remotePreference === fixture.expected.remotePreference) {
      resumeRemotePreferenceCorrect += 1;
    }

    if (
      response.extraction.yearsExperience.minimum ===
      fixture.expected.yearsExperienceMinimum
    ) {
      resumeYearsCorrect += 1;
    }
  }

  const jobSkills: SetScoreCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
  const jobRequiredSkills: SetScoreCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
  const jobDomains: SetScoreCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };

  let jobSeniorityCorrect = 0;
  let jobRemoteCorrect = 0;
  let jobYearsCorrect = 0;

  for (const fixture of jobExtractionFixtures) {
    const response = await service.extractJob(fixture.request);

    addSetScores(
      jobSkills,
      fixture.expected.normalizedSkills,
      response.extraction.normalizedSkills,
    );
    addSetScores(
      jobRequiredSkills,
      fixture.expected.requiredSkills,
      response.extraction.requiredSkills,
    );
    addSetScores(jobDomains, fixture.expected.domainTags, response.extraction.domainTags);

    if (response.extraction.seniority === fixture.expected.seniority) {
      jobSeniorityCorrect += 1;
    }

    if (response.extraction.remoteType === fixture.expected.remoteType) {
      jobRemoteCorrect += 1;
    }

    if (
      response.extraction.requiredYearsExperience.minimum ===
      fixture.expected.yearsExperienceMinimum
    ) {
      jobYearsCorrect += 1;
    }
  }

  return {
    resumeSkills: finalizeSetScores(resumeSkills),
    resumeDomains: finalizeSetScores(resumeDomains),
    resumeSeniority: finalizeScalarAccuracy(
      resumeSeniorityCorrect,
      resumeExtractionFixtures.length,
    ),
    resumeRemotePreference: finalizeScalarAccuracy(
      resumeRemotePreferenceCorrect,
      resumeExtractionFixtures.length,
    ),
    resumeYearsExperience: finalizeScalarAccuracy(
      resumeYearsCorrect,
      resumeExtractionFixtures.length,
    ),
    jobSkills: finalizeSetScores(jobSkills),
    jobRequiredSkills: finalizeSetScores(jobRequiredSkills),
    jobDomains: finalizeSetScores(jobDomains),
    jobSeniority: finalizeScalarAccuracy(jobSeniorityCorrect, jobExtractionFixtures.length),
    jobRemoteType: finalizeScalarAccuracy(jobRemoteCorrect, jobExtractionFixtures.length),
    jobYearsExperience: finalizeScalarAccuracy(jobYearsCorrect, jobExtractionFixtures.length),
  };
};

const evaluateExplanation = async (service: AiService): Promise<ExplanationEvalSummary> => {
  let recommendationCorrect = 0;
  let unsupportedClaims = 0;
  let evidenceMismatches = 0;
  let missingEvidenceSignals = 0;

  for (const fixture of matchExplanationFixtures) {
    const response = await service.explainMatch(fixture.request);
    const explanation = response.explanation;

    if (explanation.recommendation === fixture.expectedRecommendation) {
      recommendationCorrect += 1;
    }

    const unsupportedPhraseFound = fixture.disallowedPhrases.some((phrase) =>
      [
        explanation.summary,
        ...explanation.strengths,
        ...explanation.gaps,
        ...explanation.dealBreakers,
      ]
        .join(' ')
        .toLowerCase()
        .includes(phrase.toLowerCase()),
    );

    if (unsupportedPhraseFound) {
      unsupportedClaims += 1;
    }

    const invalidStrength = explanation.strengths.some(
      (value) => !fixture.request.strengths.includes(value),
    );
    const invalidGap = explanation.gaps.some(
      (value) => !fixture.request.gaps.includes(value),
    );
    const invalidDealBreaker = explanation.dealBreakers.some(
      (value) => !fixture.request.dealBreakers.includes(value),
    );

    if (invalidStrength || invalidGap || invalidDealBreaker) {
      evidenceMismatches += 1;
    }

    const missingStrength =
      fixture.request.strengths.length > 0 && explanation.strengths.length === 0;
    const missingGap = fixture.request.gaps.length > 0 && explanation.gaps.length === 0;
    const missingDealBreaker =
      fixture.request.dealBreakers.length > 0 &&
      explanation.dealBreakers.length === 0;

    if (missingStrength || missingGap || missingDealBreaker) {
      missingEvidenceSignals += 1;
    }
  }

  const total = matchExplanationFixtures.length;

  return {
    total,
    recommendationCorrect,
    recommendationAccuracy: total === 0 ? 1 : recommendationCorrect / total,
    unsupportedClaims,
    unsupportedClaimRate: total === 0 ? 0 : unsupportedClaims / total,
    evidenceMismatches,
    evidenceMismatchRate: total === 0 ? 0 : evidenceMismatches / total,
    missingEvidenceSignals,
    missingEvidenceSignalRate: total === 0 ? 0 : missingEvidenceSignals / total,
  };
};

const createDefaultEvalService = (): AiService => {
  const evalMode = process.env.AI_EVAL_MODE?.trim().toLowerCase() ?? 'deterministic';
  if (evalMode === 'configured') {
    return createAiService();
  }

  return createAiService({
    provider: createDeterministicAiProvider(),
    fallbackProvider: null,
  });
};

export interface RunAiEvalOptions {
  service?: AiService;
  userId?: string;
}

export const runAiEval = async (
  options: RunAiEvalOptions = {},
): Promise<AiEvalSummary> => {
  const service = options.service ?? createDefaultEvalService();
  const userId = options.userId ?? randomUUID();

  const extraction = await evaluateExtraction(service, userId);
  const explanation = await evaluateExplanation(service);

  return {
    extraction,
    explanation,
    generatedAt: new Date().toISOString(),
  };
};

export const evaluateAiEvalThresholds = (
  summary: AiEvalSummary,
  thresholds: AiEvalThresholds = defaultAiEvalThresholds,
): string[] => {
  const failures: string[] = [];

  const setMetrics: Array<[string, SetScoreSummary]> = [
    ['extraction.resumeSkills', summary.extraction.resumeSkills],
    ['extraction.resumeDomains', summary.extraction.resumeDomains],
    ['extraction.jobSkills', summary.extraction.jobSkills],
    ['extraction.jobRequiredSkills', summary.extraction.jobRequiredSkills],
    ['extraction.jobDomains', summary.extraction.jobDomains],
  ];

  for (const [name, metric] of setMetrics) {
    if (metric.precision < thresholds.minSetPrecision) {
      failures.push(
        `${name} precision ${metric.precision.toFixed(2)} < ${thresholds.minSetPrecision.toFixed(2)}`,
      );
    }

    if (metric.recall < thresholds.minSetRecall) {
      failures.push(
        `${name} recall ${metric.recall.toFixed(2)} < ${thresholds.minSetRecall.toFixed(2)}`,
      );
    }
  }

  const scalarMetrics: Array<[string, ScalarAccuracySummary]> = [
    ['extraction.resumeSeniority', summary.extraction.resumeSeniority],
    ['extraction.resumeRemotePreference', summary.extraction.resumeRemotePreference],
    ['extraction.resumeYearsExperience', summary.extraction.resumeYearsExperience],
    ['extraction.jobSeniority', summary.extraction.jobSeniority],
    ['extraction.jobRemoteType', summary.extraction.jobRemoteType],
    ['extraction.jobYearsExperience', summary.extraction.jobYearsExperience],
  ];

  for (const [name, metric] of scalarMetrics) {
    if (metric.accuracy < thresholds.minScalarAccuracy) {
      failures.push(
        `${name} accuracy ${metric.accuracy.toFixed(2)} < ${thresholds.minScalarAccuracy.toFixed(2)}`,
      );
    }
  }

  if (
    summary.explanation.recommendationAccuracy <
    thresholds.minRecommendationAccuracy
  ) {
    failures.push(
      `explanation.recommendationAccuracy ${summary.explanation.recommendationAccuracy.toFixed(2)} < ${thresholds.minRecommendationAccuracy.toFixed(2)}`,
    );
  }

  if (summary.explanation.unsupportedClaimRate > thresholds.maxUnsupportedClaimRate) {
    failures.push(
      `explanation.unsupportedClaimRate ${summary.explanation.unsupportedClaimRate.toFixed(2)} > ${thresholds.maxUnsupportedClaimRate.toFixed(2)}`,
    );
  }

  if (summary.explanation.evidenceMismatchRate > thresholds.maxEvidenceMismatchRate) {
    failures.push(
      `explanation.evidenceMismatchRate ${summary.explanation.evidenceMismatchRate.toFixed(2)} > ${thresholds.maxEvidenceMismatchRate.toFixed(2)}`,
    );
  }

  if (
    summary.explanation.missingEvidenceSignalRate >
    thresholds.maxMissingEvidenceSignalRate
  ) {
    failures.push(
      `explanation.missingEvidenceSignalRate ${summary.explanation.missingEvidenceSignalRate.toFixed(2)} > ${thresholds.maxMissingEvidenceSignalRate.toFixed(2)}`,
    );
  }

  return failures;
};

const isMainModule = (): boolean => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPath).href;
};

if (isMainModule()) {
  const summary = await runAiEval();
  const failures = evaluateAiEvalThresholds(summary);

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    console.error('AI evaluation failed threshold checks:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
  }
}