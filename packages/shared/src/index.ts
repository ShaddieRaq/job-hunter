export const appStates = {
  discovered: 'discovered',
  shortlisted: 'shortlisted',
  reviewing: 'reviewing',
  ready_to_apply: 'ready_to_apply',
  applied: 'applied',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  archived: 'archived',
} as const;

export type AppState = (typeof appStates)[keyof typeof appStates];

export {
  authContractVersion,
  authLoginRequestSchema,
  authRegisterRequestSchema,
  authSessionSchema,
  authUserSchema,
  emailSchema,
  userIdSchema,
} from './contracts/auth/v1.js';

export {
  notificationPreferencesSchema,
  preferencesContractVersion,
  remotePreferenceSchema,
  senioritySchema,
  userPreferencesPayloadSchema,
  userPreferencesSchema,
} from './contracts/preferences/v1.js';

export {
  resumeContentTypeSchema,
  resumeContractVersion,
  resumeDetailsResponseSchema,
  resumeIdSchema,
  resumeListResponseSchema,
  resumeMetadataSchema,
  resumeParseStatusSchema,
  resumeStructuredProfileSchema,
  resumeUploadRequestSchema,
  resumeUploadResponseSchema,
} from './contracts/resume/v1.js';


export {
  aiContractVersion,
  canonicalJobIdSchema,
  extractedJobSchema,
  extractedResumeSchema,
  extractionMetadataSchema,
  jobExtractionRequestSchema,
  jobExtractionResponseSchema,
  matchExplanationRequestSchema,
  matchExplanationResponseSchema,
  matchExplanationSchema,
  matchScoreArtifactSchema,
  matchScoreRequestSchema,
  matchScoreResponseSchema,
  matchScoreVersionsResponseSchema,
  resumeExtractionRequestSchema,
  resumeExtractionResponseSchema,
  scoreBreakdownSchema,
  yearsOfExperienceSchema,
} from './contracts/ai/v1.js';

export {
  connectorContractVersion,
  connectorListResponseSchema,
  connectorSyncRequestSchema,
  connectorSyncResponseSchema,
  sourceConnectorHealthStatusSchema,
  sourceConnectorSchema,
  sourceEmploymentTypeSchema,
  sourceJobListResponseSchema,
  sourceJobStatusSchema,
  sourceJobSummarySchema,
  sourceNameSchema,
  sourceRemoteTypeSchema,
  sourceSalaryPeriodSchema,
} from './contracts/connectors/v1.js';

export {
  canonicalJobDetailsResponseSchema,
  canonicalJobDetailSchema,
  canonicalJobListResponseSchema,
  canonicalJobSummarySchema,
  canonicalMappingReasonCodeSchema,
  canonicalRebuildRequestSchema,
  canonicalRebuildResponseSchema,
  canonicalSourceMappingSchema,
  jobsContractVersion,
} from './contracts/jobs/v1.js';

export {
  profileContractVersion,
  userProfilePayloadSchema,
  userProfileSchema,
  workAuthorizationSchema,
} from './contracts/profile/v1.js';

export type {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthSession,
  AuthUser,
} from './contracts/auth/v1.js';

export type {
  NotificationPreferences,
  RemotePreference,
  Seniority,
  UserPreferences,
  UserPreferencesPayload,
} from './contracts/preferences/v1.js';

export type {
  ResumeContentType,
  ResumeDetailsResponse,
  ResumeId,
  ResumeListResponse,
  ResumeMetadata,
  ResumeParseStatus,
  ResumeStructuredProfile,
  ResumeUploadRequest,
  ResumeUploadResponse,
} from './contracts/resume/v1.js';


export type {
  ExtractedJob,
  ExtractedResume,
  JobExtractionRequest,
  JobExtractionResponse,
  MatchExplanation,
  MatchExplanationRequest,
  MatchExplanationResponse,
  MatchScoreArtifact,
  MatchScoreRequest,
  MatchScoreResponse,
  MatchScoreVersionsResponse,
  ResumeExtractionRequest,
  ResumeExtractionResponse,
  ScoreBreakdown,
} from './contracts/ai/v1.js';

export type {
  ConnectorListResponse,
  ConnectorSyncRequest,
  ConnectorSyncResponse,
  SourceConnector,
  SourceConnectorHealthStatus,
  SourceEmploymentType,
  SourceJobListResponse,
  SourceJobStatus,
  SourceJobSummary,
  SourceName,
  SourceRemoteType,
  SourceSalaryPeriod,
} from './contracts/connectors/v1.js';

export type {
  CanonicalJobDetail,
  CanonicalJobDetailsResponse,
  CanonicalJobId,
  CanonicalJobListResponse,
  CanonicalJobSummary,
  CanonicalMappingReasonCode,
  CanonicalRebuildRequest,
  CanonicalRebuildResponse,
  CanonicalSourceMapping,
} from './contracts/jobs/v1.js';

export type {
  UserProfile,
  UserProfilePayload,
  WorkAuthorization,
} from './contracts/profile/v1.js';
