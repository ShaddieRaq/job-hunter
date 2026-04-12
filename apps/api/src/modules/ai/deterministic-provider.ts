import type {
  ExtractedResume,
  JobExtractionRequest,
  MatchExplanationRequest,
} from '@job-hunter/shared';

import type { AiProvider, AiProviderResult } from './types.js';

export const deterministicAiProviderId = 'deterministic';

const deterministicExtractorVersion = 'deterministic-bootstrap-v2';
const deterministicModelVersion = 'not_configured';

const knownSkills = [
  'TypeScript',
  'JavaScript',
  'Node.js',
  'React',
  'SQL',
  'Python',
  'AWS',
  'GCP',
  'Docker',
  'Kubernetes',
] as const;

const knownDomains = [
  'fintech',
  'healthcare',
  'edtech',
  'ecommerce',
  'developer tools',
  'security',
] as const;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const findMatches = (rawText: string, candidates: readonly string[]): string[] => {
  const source = rawText.toLowerCase();
  return candidates.filter((candidate) =>
    source.includes(candidate.toLowerCase()),
  );
};

const inferSeniority = (rawText: string): ExtractedResume['inferredSeniority'] => {
  const source = rawText.toLowerCase();

  if (source.includes('staff ') || source.includes('principal ')) {
    return 'staff';
  }

  if (source.includes('senior')) {
    return 'senior';
  }

  if (source.includes('lead')) {
    return 'staff';
  }

  if (source.includes('manager')) {
    return 'senior';
  }

  if (source.includes('intern')) {
    return 'intern';
  }

  if (source.includes('junior')) {
    return 'junior';
  }

  return 'mid';
};

const inferYearsExperience = (
  rawText: string,
): { minimum: number | null; maximum: number | null } => {
  const source = rawText.toLowerCase();
  const exactMatch = source.match(/(\d{1,2})\+?\s+years?/);
  if (!exactMatch) {
    return { minimum: null, maximum: null };
  }

  const years = Number(exactMatch[1]);
  return { minimum: years, maximum: null };
};

const withProviderMetadata = <T>(output: T): AiProviderResult<T> => ({
  output,
  extractorVersion: deterministicExtractorVersion,
  modelVersion: deterministicModelVersion,
});

export const createDeterministicAiProvider = (): AiProvider => ({
  providerId: deterministicAiProviderId,

  async extractResume(payload) {
    const skills = findMatches(payload.rawText, knownSkills);
    const domains = findMatches(payload.rawText, knownDomains);
    const remotePreference = payload.rawText.toLowerCase().includes('remote')
      ? 'remote'
      : null;

    return withProviderMetadata({
      normalizedSkills: unique(skills),
      domains: unique(domains),
      experienceRoles: [],
      yearsExperience: inferYearsExperience(payload.rawText),
      inferredSeniority: inferSeniority(payload.rawText),
      preferredLocations: [],
      remotePreference,
      sponsorshipRequired: null,
      workAuthorization: null,
    });
  },

  async extractJob(payload: JobExtractionRequest) {
    const skills = findMatches(payload.rawText, knownSkills);
    const requiredSkills = payload.rawText.toLowerCase().includes('required')
      ? skills
      : [];

    return withProviderMetadata({
      normalizedTitle: payload.rawText.split('\n')[0]?.trim() || 'Unknown title',
      normalizedSkills: unique(skills),
      requiredSkills: unique(requiredSkills),
      preferredSkills: unique(skills.filter((skill) => !requiredSkills.includes(skill))),
      requiredYearsExperience: inferYearsExperience(payload.rawText),
      domainTags: unique(findMatches(payload.rawText, knownDomains)),
      seniority: inferSeniority(payload.rawText),
      locationConstraint: null,
      remoteType: payload.rawText.toLowerCase().includes('remote')
        ? 'remote'
        : null,
      sponsorshipAvailable: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    });
  },

  async explainMatch(payload: MatchExplanationRequest) {
    const hasDealBreakers = payload.dealBreakers.length > 0;
    const recommendation = hasDealBreakers
      ? 'skip'
      : payload.scoreBreakdown.overallScore >= 75
        ? 'apply'
        : 'review';

    const summary = hasDealBreakers
      ? 'Low fit due to one or more explicit deal breakers.'
      : `Overall fit score is ${payload.scoreBreakdown.overallScore.toFixed(0)}/100 based on deterministic scoring components.`;

    return withProviderMetadata({
      summary,
      strengths: payload.strengths.slice(0, 3),
      gaps: payload.gaps.slice(0, 3),
      dealBreakers: payload.dealBreakers.slice(0, 3),
      recommendation,
    });
  },
});