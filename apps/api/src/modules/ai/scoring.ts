import type {
  ExtractedJob,
  ExtractedResume,
  ScoreBreakdown,
  UserPreferences,
} from '@job-hunter/shared';

export const deterministicScoringVersion = 'deterministic-score-v1';

export interface BuildDeterministicMatchScoreInput {
  resumeExtraction: ExtractedResume;
  jobExtraction: ExtractedJob;
  preferences: UserPreferences;
}

export interface DeterministicMatchScoreResult {
  scoreBreakdown: ScoreBreakdown;
  strengths: string[];
  gaps: string[];
  dealBreakers: string[];
  recommendation: 'apply' | 'review' | 'skip';
}

const seniorityRank = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
} as const;

const maxSignals = 20;

const clampPercentage = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const normalizeText = (value: string): string => value.trim().toLowerCase();

const dedupeValues = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(value.trim());
  }

  return deduped;
};

const toSet = (values: string[]): Set<string> =>
  new Set(
    dedupeValues(values).map((value) => normalizeText(value)),
  );

const tokenSet = (value: string): Set<string> =>
  new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );

const tokenSimilarity = (left: string, right: string): number => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

const coverageRatio = (expected: Set<string>, actual: Set<string>): number => {
  if (expected.size === 0) {
    return 1;
  }

  let matched = 0;
  for (const item of expected) {
    if (actual.has(item)) {
      matched += 1;
    }
  }

  return matched / expected.size;
};

const missingValues = (expected: Set<string>, actual: Set<string>): string[] => {
  const missing: string[] = [];

  for (const item of expected) {
    if (!actual.has(item)) {
      missing.push(item);
    }
  }

  return missing;
};

const pushUnique = (target: string[], value: string): void => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return;
  }

  if (target.some((item) => normalizeText(item) === normalized)) {
    return;
  }

  if (target.length >= maxSignals) {
    return;
  }

  target.push(value.trim());
};

const buildRecommendation = (
  overallScore: number,
  dealBreakers: string[],
): 'apply' | 'review' | 'skip' => {
  if (dealBreakers.length > 0) {
    return 'skip';
  }

  if (overallScore >= 75) {
    return 'apply';
  }

  if (overallScore >= 45) {
    return 'review';
  }

  return 'skip';
};

const preferredTitleMatch = (jobTitle: string, preferredTitles: string[]): number => {
  if (preferredTitles.length === 0) {
    return 0;
  }

  let best = 0;
  for (const preferredTitle of preferredTitles) {
    const score = tokenSimilarity(jobTitle, preferredTitle);
    if (score > best) {
      best = score;
    }
  }

  return best;
};

export const buildDeterministicMatchScore = ({
  resumeExtraction,
  jobExtraction,
  preferences,
}: BuildDeterministicMatchScoreInput): DeterministicMatchScoreResult => {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const dealBreakers: string[] = [];

  let penaltyScore = 0;

  const resumeSkills = toSet(resumeExtraction.normalizedSkills);
  const requiredSkills = toSet(jobExtraction.requiredSkills);
  const preferredSkills = toSet(jobExtraction.preferredSkills);
  const jobDomains = toSet(jobExtraction.domainTags);

  const titleSimilarityScore = preferredTitleMatch(
    jobExtraction.normalizedTitle,
    preferences.preferredTitles,
  );

  let titleScore =
    preferences.preferredTitles.length === 0
      ? 65
      : clampPercentage(35 + titleSimilarityScore * 65);

  const roleMatch = resumeExtraction.experienceRoles.some(
    (role) => tokenSimilarity(role, jobExtraction.normalizedTitle) >= 0.4,
  );
  if (roleMatch) {
    titleScore = clampPercentage(titleScore + 10);
    pushUnique(strengths, 'Previous experience roles align with the normalized job title.');
  }

  if (titleSimilarityScore >= 0.55) {
    pushUnique(strengths, 'Preferred title alignment is strong for this role.');
  } else if (preferences.preferredTitles.length > 0 && titleSimilarityScore < 0.2) {
    pushUnique(gaps, 'Job title has low overlap with preferred titles.');
  }

  const requiredCoverage = coverageRatio(requiredSkills, resumeSkills);
  const preferredCoverage = coverageRatio(preferredSkills, resumeSkills);

  let skillScore =
    requiredSkills.size === 0 && preferredSkills.size === 0
      ? 65
      : clampPercentage(requiredCoverage * 75 + preferredCoverage * 25);

  if (requiredCoverage >= 0.75 && requiredSkills.size > 0) {
    pushUnique(strengths, 'Resume covers most required skills from the job posting.');
  }

  const missingRequired = missingValues(requiredSkills, resumeSkills);
  for (const missingSkill of missingRequired.slice(0, 3)) {
    pushUnique(gaps, `Missing required skill evidence: ${missingSkill}.`);
  }

  if (requiredSkills.size > 0 && requiredCoverage < 0.5) {
    penaltyScore += 20;
    pushUnique(dealBreakers, 'Resume misses a majority of required job skills.');
  }

  const preferenceSkillOverlap = coverageRatio(
    toSet(preferences.preferredSkills),
    toSet(jobExtraction.normalizedSkills),
  );
  if (preferences.preferredSkills.length > 0 && preferenceSkillOverlap >= 0.4) {
    skillScore = clampPercentage(skillScore + 8);
    pushUnique(strengths, 'Job stack overlaps with preferred skill focus areas.');
  }

  const jobSeniorityRank =
    jobExtraction.seniority === null ? null : seniorityRank[jobExtraction.seniority];
  const resumeSeniorityRank =
    resumeExtraction.inferredSeniority === null
      ? null
      : seniorityRank[resumeExtraction.inferredSeniority];
  const targetMinRank =
    preferences.targetSeniorityMin === null
      ? null
      : seniorityRank[preferences.targetSeniorityMin];
  const targetMaxRank =
    preferences.targetSeniorityMax === null
      ? null
      : seniorityRank[preferences.targetSeniorityMax];

  let seniorityScore = 62;
  if (jobSeniorityRank !== null) {
    seniorityScore = 70;

    if (targetMinRank !== null && jobSeniorityRank < targetMinRank) {
      seniorityScore -= 20;
      pushUnique(gaps, 'Job seniority is below target minimum preference.');
    }

    if (targetMaxRank !== null && jobSeniorityRank > targetMaxRank) {
      seniorityScore -= 18;
      pushUnique(gaps, 'Job seniority is above target maximum preference.');
    }

    if (
      targetMinRank !== null &&
      targetMaxRank !== null &&
      jobSeniorityRank >= targetMinRank &&
      jobSeniorityRank <= targetMaxRank
    ) {
      seniorityScore += 18;
      pushUnique(strengths, 'Job seniority sits inside the configured target range.');
    }

    if (resumeSeniorityRank !== null) {
      const diff = Math.abs(jobSeniorityRank - resumeSeniorityRank);
      if (diff === 0) {
        seniorityScore += 12;
      } else if (diff === 1) {
        seniorityScore += 4;
      } else {
        seniorityScore -= 14;
        pushUnique(gaps, 'Resume seniority appears far from the role level.');
      }
    }
  }
  seniorityScore = clampPercentage(seniorityScore);

  let locationScore = 68;
  const preferredRemote = preferences.remotePreference;
  const remoteType = jobExtraction.remoteType;

  if (remoteType !== null) {
    if (preferredRemote === 'remote') {
      locationScore = remoteType === 'remote' ? 95 : remoteType === 'hybrid' ? 68 : 18;
      if (remoteType === 'onsite') {
        penaltyScore += 25;
        pushUnique(dealBreakers, 'Remote-only preference conflicts with onsite job requirement.');
      }
    } else if (preferredRemote === 'hybrid') {
      locationScore = remoteType === 'hybrid' ? 92 : remoteType === 'remote' ? 82 : 45;
    } else if (preferredRemote === 'onsite') {
      locationScore = remoteType === 'onsite' ? 90 : remoteType === 'hybrid' ? 70 : 45;
    } else {
      locationScore = remoteType === 'onsite' ? 78 : 85;
    }
  }

  if (jobExtraction.locationConstraint && preferences.preferredLocations.length > 0) {
    const normalizedLocation = normalizeText(jobExtraction.locationConstraint);
    const hasPreferredLocationMatch = preferences.preferredLocations.some((location) =>
      normalizedLocation.includes(normalizeText(location)),
    );

    if (hasPreferredLocationMatch) {
      locationScore = clampPercentage(locationScore + 10);
      pushUnique(strengths, 'Location constraint overlaps with preferred locations.');
    } else {
      locationScore = clampPercentage(locationScore - 12);
      pushUnique(gaps, 'Location constraint does not match preferred locations.');
    }
  }

  let compensationScore = 65;
  const salaryFloor = preferences.salaryMin;
  const salaryTarget = preferences.salaryTarget;
  const knownSalaryMax = jobExtraction.salaryMax ?? jobExtraction.salaryMin;

  if (salaryFloor !== null || salaryTarget !== null) {
    if (knownSalaryMax === null) {
      compensationScore = 55;
      pushUnique(gaps, 'Compensation data is missing in the job posting.');
    } else {
      if (salaryTarget !== null && knownSalaryMax >= salaryTarget) {
        compensationScore = 92;
        pushUnique(strengths, 'Compensation range meets the target salary preference.');
      } else if (salaryFloor !== null && knownSalaryMax >= salaryFloor) {
        compensationScore = 78;
      } else if (salaryFloor !== null && knownSalaryMax < salaryFloor) {
        compensationScore = 20;
        penaltyScore += 30;
        pushUnique(dealBreakers, 'Compensation range is below the configured salary floor.');
      } else {
        compensationScore = 60;
      }
    }
  }

  const domainSignals = toSet([
    ...resumeExtraction.domains,
    ...preferences.preferredIndustries,
  ]);

  let domainScore = 62;
  if (jobDomains.size > 0 && domainSignals.size > 0) {
    const domainCoverage = coverageRatio(jobDomains, domainSignals);
    domainScore = clampPercentage(35 + domainCoverage * 65);

    if (domainCoverage >= 0.5) {
      pushUnique(strengths, 'Domain tags align with background and industry preferences.');
    } else {
      pushUnique(gaps, 'Domain tag overlap is limited for this role.');
    }
  }

  const resumeYears =
    resumeExtraction.yearsExperience.maximum ?? resumeExtraction.yearsExperience.minimum;
  const requiredYears = jobExtraction.requiredYearsExperience.minimum;

  let yearsScore = 70;
  if (requiredYears !== null) {
    if (resumeYears === null) {
      yearsScore = 45;
      pushUnique(gaps, 'Resume does not provide enough years-of-experience evidence.');
    } else if (resumeYears >= requiredYears) {
      yearsScore = 90;
    } else {
      const deficit = requiredYears - resumeYears;
      yearsScore = clampPercentage(90 - deficit * 20);
      pushUnique(gaps, 'Years-of-experience evidence falls below job requirement.');

      if (deficit >= 2) {
        penaltyScore += 15;
        pushUnique(dealBreakers, 'Years-of-experience gap is materially below required minimum.');
      }
    }
  }

  const requirementScore = clampPercentage(requiredCoverage * 70 + yearsScore * 0.3);

  let trajectoryScore = 66;
  if (jobSeniorityRank !== null && resumeSeniorityRank !== null) {
    const diff = jobSeniorityRank - resumeSeniorityRank;
    if (diff <= 0) {
      trajectoryScore = 76;
    } else if (diff === 1) {
      trajectoryScore = 66 + preferences.stretchPreferenceLevel * 4;
    } else if (diff === 2) {
      trajectoryScore = 42 + preferences.stretchPreferenceLevel * 8;
    } else {
      trajectoryScore = 20 + preferences.stretchPreferenceLevel * 6;
    }

    if (diff >= 2 && preferences.stretchPreferenceLevel <= 2) {
      pushUnique(gaps, 'Role may be too aggressive relative to current stretch preference.');
      trajectoryScore -= 10;
    }

    if (diff === 1 && preferences.stretchPreferenceLevel >= 4) {
      pushUnique(strengths, 'Role reflects a deliberate one-level stretch trajectory.');
    }
  }
  trajectoryScore = clampPercentage(trajectoryScore);

  if (resumeExtraction.sponsorshipRequired === true && jobExtraction.sponsorshipAvailable === false) {
    penaltyScore += 35;
    pushUnique(dealBreakers, 'Sponsorship requirement conflicts with role sponsorship availability.');
  }

  if (
    resumeExtraction.workAuthorization &&
    jobExtraction.locationConstraint &&
    !normalizeText(resumeExtraction.workAuthorization).includes(
      normalizeText(jobExtraction.locationConstraint),
    )
  ) {
    pushUnique(gaps, 'Work authorization context may not align with location constraint.');
  }

  const jobKeywordCorpus = normalizeText([
    jobExtraction.normalizedTitle,
    ...(jobExtraction.requiredSkills ?? []),
    ...(jobExtraction.domainTags ?? []),
    jobExtraction.locationConstraint ?? '',
  ].join(' '));

  let keywordPenaltyApplied = 0;
  for (const dealBreakerKeyword of preferences.dealBreakers) {
    if (keywordPenaltyApplied >= 30) {
      break;
    }

    const normalizedKeyword = normalizeText(dealBreakerKeyword);
    if (normalizedKeyword.length < 3) {
      continue;
    }

    if (jobKeywordCorpus.includes(normalizedKeyword)) {
      keywordPenaltyApplied += 10;
      pushUnique(
        dealBreakers,
        `Job content matches configured deal-breaker keyword: ${dealBreakerKeyword}.`,
      );
    }
  }
  penaltyScore += keywordPenaltyApplied;

  penaltyScore = clampPercentage(penaltyScore);

  const weightedScore =
    titleScore * 0.1 +
    skillScore * 0.22 +
    seniorityScore * 0.1 +
    locationScore * 0.12 +
    compensationScore * 0.1 +
    domainScore * 0.1 +
    requirementScore * 0.18 +
    trajectoryScore * 0.08;

  const overallScore = clampPercentage(weightedScore - penaltyScore * 0.55);

  const scoreBreakdown: ScoreBreakdown = {
    overallScore,
    titleScore,
    skillScore,
    seniorityScore,
    locationScore,
    compensationScore,
    domainScore,
    requirementScore,
    trajectoryScore,
    penaltyScore,
  };

  const recommendation = buildRecommendation(overallScore, dealBreakers);

  return {
    scoreBreakdown,
    strengths: dedupeValues(strengths).slice(0, maxSignals),
    gaps: dedupeValues(gaps).slice(0, maxSignals),
    dealBreakers: dedupeValues(dealBreakers).slice(0, maxSignals),
    recommendation,
  };
};