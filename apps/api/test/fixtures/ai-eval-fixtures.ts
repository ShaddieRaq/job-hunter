import type {
  JobExtractionRequest,
  MatchExplanationRequest,
  RemotePreference,
  ResumeExtractionRequest,
  Seniority,
} from '@job-hunter/shared';

export interface ResumeExtractionFixture {
  id: string;
  request: ResumeExtractionRequest;
  expected: {
    normalizedSkills: string[];
    domains: string[];
    inferredSeniority: Seniority | null;
    remotePreference: RemotePreference | null;
    yearsExperienceMinimum: number | null;
  };
}

export interface JobExtractionFixture {
  id: string;
  request: JobExtractionRequest;
  expected: {
    normalizedSkills: string[];
    requiredSkills: string[];
    domainTags: string[];
    seniority: Seniority | null;
    remoteType: RemotePreference | null;
    yearsExperienceMinimum: number | null;
  };
}

export interface MatchExplanationFixture {
  id: string;
  request: MatchExplanationRequest;
  expectedRecommendation: 'apply' | 'review' | 'skip';
  disallowedPhrases: string[];
}

export const resumeExtractionFixtures: ResumeExtractionFixture[] = [
  {
    id: 'resume-senior-fintech-remote',
    request: {
      rawText:
        'Senior Software Engineer with 8 years experience building fintech products. Core skills: TypeScript, Node.js, AWS, Docker. Open to remote roles.',
      sourceFilename: 'resume_alex_senior.pdf',
    },
    expected: {
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS', 'Docker'],
      domains: ['fintech'],
      inferredSeniority: 'senior',
      remotePreference: 'remote',
      yearsExperienceMinimum: 8,
    },
  },
  {
    id: 'resume-mid-healthcare-onsite',
    request: {
      rawText:
        'Software Engineer with 3 years experience in healthcare analytics. Skills include Python and SQL with cross-functional product collaboration.',
      sourceFilename: 'resume_casey_mid.docx',
    },
    expected: {
      normalizedSkills: ['Python', 'SQL'],
      domains: ['healthcare'],
      inferredSeniority: 'mid',
      remotePreference: null,
      yearsExperienceMinimum: 3,
    },
  },
];

export const jobExtractionFixtures: JobExtractionFixture[] = [
  {
    id: 'job-required-remote-fintech',
    request: {
      rawText: [
        'Senior Backend Engineer',
        'Required: TypeScript, Node.js, AWS, Docker',
        '5+ years experience required',
        'Remote role in fintech platform team',
      ].join('\n'),
      sourceName: 'example-source',
      sourceJobId: 'job-001',
    },
    expected: {
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS', 'Docker'],
      requiredSkills: ['TypeScript', 'Node.js', 'AWS', 'Docker'],
      domainTags: ['fintech'],
      seniority: 'senior',
      remoteType: 'remote',
      yearsExperienceMinimum: 5,
    },
  },
  {
    id: 'job-no-required-developer-tools',
    request: {
      rawText: [
        'Staff Platform Engineer',
        'Nice to have: Kubernetes, GCP, TypeScript',
        '7 years experience building developer tools products',
        'Hybrid collaboration model',
      ].join('\n'),
      sourceName: 'example-source',
      sourceJobId: 'job-002',
    },
    expected: {
      normalizedSkills: ['TypeScript', 'GCP', 'Kubernetes'],
      requiredSkills: [],
      domainTags: ['developer tools'],
      seniority: 'staff',
      remoteType: null,
      yearsExperienceMinimum: 7,
    },
  },
];

export const matchExplanationFixtures: MatchExplanationFixture[] = [
  {
    id: 'explanation-high-fit-apply',
    request: {
      userId: '6f24107f-7be8-4da7-9a29-e9f1db0ee5b4',
      canonicalJobId: 'fb116864-61b3-4b2e-b0fd-31207d45f0e0',
      scoreBreakdown: {
        overallScore: 84,
        titleScore: 90,
        skillScore: 86,
        seniorityScore: 78,
        locationScore: 92,
        compensationScore: 70,
        domainScore: 88,
        requirementScore: 81,
        trajectoryScore: 80,
        penaltyScore: 6,
      },
      strengths: [
        'Strong TypeScript and Node.js alignment with core stack',
        'Direct fintech domain experience',
      ],
      gaps: ['Limited evidence of Kubernetes at scale'],
      dealBreakers: [],
    },
    expectedRecommendation: 'apply',
    disallowedPhrases: ['guaranteed visa support', 'guaranteed relocation package'],
  },
  {
    id: 'explanation-deal-breaker-skip',
    request: {
      userId: 'f0e93ecf-f4a3-4ef7-9a4d-f66af4e6107b',
      canonicalJobId: '9f869ec3-241f-4419-b4fc-efad6de42a47',
      scoreBreakdown: {
        overallScore: 79,
        titleScore: 86,
        skillScore: 80,
        seniorityScore: 76,
        locationScore: 40,
        compensationScore: 68,
        domainScore: 90,
        requirementScore: 72,
        trajectoryScore: 74,
        penaltyScore: 18,
      },
      strengths: ['Strong domain familiarity in security products'],
      gaps: ['No explicit public-cloud incident-response examples listed'],
      dealBreakers: ['Role requires full-time onsite presence in another country'],
    },
    expectedRecommendation: 'skip',
    disallowedPhrases: ['fully remote option confirmed', 'sponsorship guaranteed'],
  },
  {
    id: 'explanation-mid-fit-review',
    request: {
      userId: '8d0a6380-2de6-4e2a-8d0f-5cf42ec22cb4',
      canonicalJobId: 'de8842ce-4b77-4771-ba9d-c251329f5b17',
      scoreBreakdown: {
        overallScore: 56,
        titleScore: 64,
        skillScore: 58,
        seniorityScore: 62,
        locationScore: 70,
        compensationScore: 48,
        domainScore: 55,
        requirementScore: 59,
        trajectoryScore: 61,
        penaltyScore: 12,
      },
      strengths: ['Some overlap with preferred backend tooling'],
      gaps: ['Required cloud-native deployment experience is limited'],
      dealBreakers: [],
    },
    expectedRecommendation: 'review',
    disallowedPhrases: ['guaranteed offer', 'fully matched with all requirements'],
  },
];