import type {
  ResumeContentType,
  ResumeParseStatus,
  ResumeStructuredProfile,
  Seniority,
} from '@job-hunter/shared';

import { resumeParserVersion } from './defaults.js';

const knownSkills = [
  'TypeScript',
  'JavaScript',
  'Node.js',
  'React',
  'Next.js',
  'Python',
  'Java',
  'Go',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'GraphQL',
  'REST',
  'CI/CD',
  'Git',
] as const;

const knownRoles = [
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Engineer',
  'Principal Engineer',
  'Engineering Manager',
  'Tech Lead',
  'Data Engineer',
  'Data Scientist',
  'Backend Engineer',
  'Frontend Engineer',
  'Full Stack Engineer',
  'Product Manager',
  'Designer',
  'DevOps Engineer',
  'Site Reliability Engineer',
] as const;

const knownIndustryTokens = [
  {
    industry: 'Fintech',
    tokens: ['fintech', 'payments', 'banking', 'financial services'],
  },
  {
    industry: 'Healthcare',
    tokens: ['healthcare', 'clinical', 'ehr', 'patient'],
  },
  {
    industry: 'Ecommerce',
    tokens: ['e-commerce', 'ecommerce', 'retail', 'marketplace'],
  },
  {
    industry: 'Enterprise SaaS',
    tokens: ['saas', 'b2b', 'enterprise software'],
  },
  {
    industry: 'Cybersecurity',
    tokens: ['security', 'cybersecurity', 'threat detection'],
  },
] as const;

const senioritySignals: Array<{ seniority: Seniority; tokens: string[] }> = [
  { seniority: 'principal', tokens: ['principal', 'distinguished'] },
  { seniority: 'staff', tokens: ['staff engineer', 'staff'] },
  { seniority: 'senior', tokens: ['senior', 'lead engineer', 'lead developer'] },
  { seniority: 'mid', tokens: ['mid-level', 'mid level', 'intermediate'] },
  { seniority: 'junior', tokens: ['junior', 'associate'] },
  { seniority: 'intern', tokens: ['intern', 'internship'] },
];

type ParsedStructuredProfile = Omit<
  ResumeStructuredProfile,
  'resumeId' | 'extractedAt'
>;

export interface ParseResumeInput {
  contentType: ResumeContentType;
  contentBuffer: Buffer;
}

export interface ParseResumeResult {
  parseStatus: ResumeParseStatus;
  parsedText: string | null;
  structuredProfile: ParsedStructuredProfile | null;
}

export interface ResumeParser {
  parserVersion: string;
  parse(input: ParseResumeInput): ParseResumeResult;
}

const dedupeList = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();

    if (trimmed.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped;
};

const findKnownValues = (textLower: string, values: readonly string[]): string[] =>
  values.filter((value) => textLower.includes(value.toLowerCase()));

const detectCompanies = (text: string): string[] => {
  const matches = text.matchAll(/(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,80})/g);
  const companies: string[] = [];

  for (const match of matches) {
    const company = match[1]?.trim();
    if (!company) {
      continue;
    }

    companies.push(company.replace(/\s+/g, ' '));
  }

  return dedupeList(companies);
};

const detectEducation = (lines: string[]): string[] => {
  const educationSignals = ['bachelor', 'master', 'phd', 'b.sc', 'm.sc', 'mba'];
  const educationLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return educationSignals.some((signal) => lower.includes(signal));
  });

  return dedupeList(educationLines);
};

const detectCertifications = (lines: string[]): string[] => {
  const certificationSignals = [
    'certified',
    'certification',
    'aws certified',
    'azure certified',
    'pmp',
  ];

  const certificationLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return certificationSignals.some((signal) => lower.includes(signal));
  });

  return dedupeList(certificationLines);
};

const inferSeniority = (textLower: string): Seniority | null => {
  for (const signal of senioritySignals) {
    if (signal.tokens.some((token) => textLower.includes(token))) {
      return signal.seniority;
    }
  }

  return null;
};

const detectIndustries = (textLower: string): string[] => {
  const industries: string[] = [];

  for (const candidate of knownIndustryTokens) {
    if (candidate.tokens.some((token) => textLower.includes(token))) {
      industries.push(candidate.industry);
    }
  }

  return dedupeList(industries);
};

const computeConfidence = (
  profile: Omit<ParsedStructuredProfile, 'extractionConfidence'>,
): number => {
  const signalCount = [
    profile.normalizedSkills.length > 0,
    profile.experienceRoles.length > 0,
    profile.companies.length > 0,
    profile.industries.length > 0,
    profile.education.length > 0,
    profile.certifications.length > 0,
    profile.inferredSeniority !== null,
  ].filter(Boolean).length;

  const confidence = Math.min(0.95, 0.2 + signalCount * 0.11);
  return Number(confidence.toFixed(2));
};

export const createHeuristicResumeParser = (): ResumeParser => ({
  parserVersion: resumeParserVersion,
  parse({ contentType, contentBuffer }) {
    if (contentType !== 'text/plain') {
      return {
        parseStatus: 'unsupported_format',
        parsedText: null,
        structuredProfile: null,
      };
    }

    const parsedText = contentBuffer.toString('utf8').replaceAll('\0', '').trim();
    if (parsedText.length === 0) {
      return {
        parseStatus: 'failed',
        parsedText,
        structuredProfile: null,
      };
    }

    const lines = parsedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const textLower = parsedText.toLowerCase();

    const normalizedSkills = dedupeList(findKnownValues(textLower, knownSkills));
    const experienceRoles = dedupeList(findKnownValues(textLower, knownRoles));
    const companies = detectCompanies(parsedText);
    const industries = detectIndustries(textLower);
    const education = detectEducation(lines);
    const certifications = detectCertifications(lines);
    const inferredSeniority = inferSeniority(textLower);

    const profileWithoutConfidence = {
      normalizedSkills,
      experienceRoles,
      companies,
      industries,
      education,
      certifications,
      inferredSeniority,
    };

    return {
      parseStatus: 'parsed',
      parsedText,
      structuredProfile: {
        ...profileWithoutConfidence,
        extractionConfidence: computeConfidence(profileWithoutConfidence),
      },
    };
  },
});