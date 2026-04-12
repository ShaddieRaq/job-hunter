import type {
  ExtractedJob,
  ExtractedResume,
  JobExtractionRequest,
  MatchExplanation,
  MatchExplanationRequest,
  ResumeExtractionRequest,
} from '@job-hunter/shared';

const aiSchemaVersion = 'ai-schema-v1';
const aiExtractorVersion = 'deterministic-bootstrap-v1';
const aiModelVersion = 'not_configured';

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

const inferYearsExperience = (rawText: string): { minimum: number | null; maximum: number | null } => {
  const source = rawText.toLowerCase();
  const exactMatch = source.match(/(\d{1,2})\+?\s+years?/);
  if (!exactMatch) {
    return { minimum: null, maximum: null };
  }

  const years = Number(exactMatch[1]);
  return { minimum: years, maximum: null };
};

const createMetadata = () => ({
  schemaVersion: aiSchemaVersion,
  extractorVersion: aiExtractorVersion,
  modelVersion: aiModelVersion,
  generatedAt: new Date().toISOString(),
});

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export interface AiService {
  extractResume(userId: string, payload: ResumeExtractionRequest): {
    userId: string;
    extraction: ExtractedResume;
    metadata: ReturnType<typeof createMetadata>;
  };
  extractJob(payload: JobExtractionRequest): {
    extraction: ExtractedJob;
    metadata: ReturnType<typeof createMetadata>;
  };
  explainMatch(payload: MatchExplanationRequest): {
    canonicalJobId: string;
    explanation: MatchExplanation;
    metadata: ReturnType<typeof createMetadata>;
  };
}

export const createAiService = (): AiService => ({
  extractResume(userId, payload) {
    const skills = findMatches(payload.rawText, knownSkills);
    const domains = findMatches(payload.rawText, knownDomains);
    const remotePreference = payload.rawText.toLowerCase().includes('remote')
      ? 'remote'
      : null;

    return {
      userId,
      extraction: {
        normalizedSkills: unique(skills),
        domains: unique(domains),
        experienceRoles: [],
        yearsExperience: inferYearsExperience(payload.rawText),
        inferredSeniority: inferSeniority(payload.rawText),
        preferredLocations: [],
        remotePreference,
        sponsorshipRequired: null,
        workAuthorization: null,
      },
      metadata: createMetadata(),
    };
  },

  extractJob(payload) {
    const skills = findMatches(payload.rawText, knownSkills);
    const requiredSkills = payload.rawText.toLowerCase().includes('required')
      ? skills
      : [];

    return {
      extraction: {
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
      },
      metadata: createMetadata(),
    };
  },

  explainMatch(payload) {
    const hasDealBreakers = payload.dealBreakers.length > 0;
    const recommendation = hasDealBreakers
      ? 'skip'
      : payload.scoreBreakdown.overallScore >= 75
        ? 'apply'
        : 'review';

    const summary = hasDealBreakers
      ? 'Low fit due to one or more explicit deal breakers.'
      : `Overall fit score is ${payload.scoreBreakdown.overallScore.toFixed(0)}/100 based on deterministic scoring components.`;

    return {
      canonicalJobId: payload.canonicalJobId,
      explanation: {
        summary,
        strengths: payload.strengths.slice(0, 3),
        gaps: payload.gaps.slice(0, 3),
        dealBreakers: payload.dealBreakers.slice(0, 3),
        recommendation,
      },
      metadata: createMetadata(),
    };
  },
});
