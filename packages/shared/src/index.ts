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
  applicationCreateRequestSchema,
  applicationGuidanceBulletSuggestionSchema,
  applicationGuidanceJobSnapshotSchema,
  applicationIdSchema,
  applicationListResponseSchema,
  applicationMaterialGuidanceResponseSchema,
  applicationMaterialGuidanceSchema,
  applicationRecordSchema,
  applicationResponseSchema,
  applicationsContractVersion,
  applicationStatusSchema,
  applicationUpdateRequestSchema,
} from './contracts/applications/v1.js';

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
  sourceJobDetailResponseSchema,
  sourceJobDetailSchema,
  sourceJobListResponseSchema,
  sourceJobStatusSchema,
  sourceJobSummarySchema,
  sourceNameSchema,
  sourceRemoteTypeSchema,
  sourceSalaryPeriodSchema,
} from './contracts/connectors/v1.js';

export {
  canonicalDedupeTraceEventSchema,
  canonicalDedupeTraceEventsResponseSchema,
  canonicalJobDetailsResponseSchema,
  canonicalJobDetailSchema,
  canonicalJobListResponseSchema,
  canonicalJobSummarySchema,
  canonicalMappingReasonCodeSchema,
  canonicalRebuildRequestSchema,
  canonicalRebuildResponseSchema,
  canonicalSourceMappingSchema,
  feedNextActionSchema,
  feedNextActionTypeSchema,
  feedQuerySchema,
  feedRecommendationFilterSchema,
  feedRemoteFilterSchema,
  feedSourceFilterSchema,
  feedSortSchema,
  dedupeTraceEventTypeSchema,
  feedDetailResponseSchema,
  feedJobCardSchema,
  feedResponseSchema,
  jobsContractVersion,
} from './contracts/jobs/v1.js';

export {
  reminderCompleteRequestSchema,
  reminderCreateRequestSchema,
  reminderIdSchema,
  reminderListResponseSchema,
  reminderResponseSchema,
  reminderStatusSchema,
  remindersContractVersion,
  reminderTaskSchema,
  reminderTaskTypeSchema,
} from './contracts/reminders/v1.js';

export {
  savedSearchCreateRequestSchema,
  savedSearchDeleteResponseSchema,
  savedSearchesContractVersion,
  savedSearchIdSchema,
  savedSearchListResponseSchema,
  savedSearchQuerySchema,
  savedSearchRecommendationFilterSchema,
  savedSearchRemoteFilterSchema,
  savedSearchResponseSchema,
  savedSearchSchema,
  savedSearchSourceFilterSchema,
  savedSearchSortSchema,
} from './contracts/saved-searches/v1.js';

export {
  notificationChannelSchema,
  notificationDispatchAllUsersResponseSchema,
  notificationDispatchRequestSchema,
  notificationDispatchResponseSchema,
  notificationIdSchema,
  notificationListResponseSchema,
  notificationLogSchema,
  notificationsContractVersion,
  notificationStatusSchema,
  notificationTypeSchema,
} from './contracts/notifications/v1.js';

export {
  profileContractVersion,
  userProfilePayloadSchema,
  userProfileSchema,
  workAuthorizationSchema,
} from './contracts/profile/v1.js';

export {
  trackerDiscoveryActionRequestSchema,
  trackerDiscoveryActionResponseSchema,
  trackerDiscoveryActionSchema,
  trackedJobStateSchema,
  trackerContractVersion,
  trackerHistoryResponseSchema,
  trackerJobListResponseSchema,
  trackerJobStateResponseSchema,
  trackerStateSchema,
  trackerTransitionEventSchema,
  trackerTransitionRequestSchema,
  trackerTransitionResponseSchema,
} from './contracts/tracker/v1.js';

export type {
  ApplicationCreateRequest,
  ApplicationGuidanceBulletSuggestion,
  ApplicationGuidanceJobSnapshot,
  ApplicationId,
  ApplicationListResponse,
  ApplicationMaterialGuidance,
  ApplicationMaterialGuidanceResponse,
  ApplicationRecord,
  ApplicationResponse,
  ApplicationStatus,
  ApplicationUpdateRequest,
} from './contracts/applications/v1.js';

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
  SourceJobDetail,
  SourceJobDetailResponse,
  SourceJobListResponse,
  SourceJobStatus,
  SourceJobSummary,
  SourceName,
  SourceRemoteType,
  SourceSalaryPeriod,
} from './contracts/connectors/v1.js';

export type {
  CanonicalDedupeTraceEvent,
  CanonicalDedupeTraceEventsResponse,
  CanonicalJobDetail,
  CanonicalJobDetailsResponse,
  CanonicalJobId,
  CanonicalJobListResponse,
  CanonicalJobSummary,
  CanonicalMappingReasonCode,
  CanonicalRebuildRequest,
  CanonicalRebuildResponse,
  CanonicalSourceMapping,
  FeedDetailResponse,
  FeedJobCard,
  FeedNextAction,
  FeedNextActionType,
  FeedQuery,
  FeedRecommendationFilter,
  FeedRemoteFilter,
  FeedResponse,
  FeedSort,
  FeedSourceFilter,
} from './contracts/jobs/v1.js';

export type {
  ReminderCompleteRequest,
  ReminderCreateRequest,
  ReminderId,
  ReminderListResponse,
  ReminderResponse,
  ReminderStatus,
  ReminderTask,
  ReminderTaskType,
} from './contracts/reminders/v1.js';

export type {
  SavedSearch,
  SavedSearchCreateRequest,
  SavedSearchDeleteResponse,
  SavedSearchId,
  SavedSearchListResponse,
  SavedSearchQuery,
  SavedSearchRecommendationFilter,
  SavedSearchRemoteFilter,
  SavedSearchResponse,
  SavedSearchSourceFilter,
  SavedSearchSort,
} from './contracts/saved-searches/v1.js';

export type {
  NotificationChannel,
  NotificationDispatchAllUsersResponse,
  NotificationDispatchRequest,
  NotificationDispatchResponse,
  NotificationId,
  NotificationListResponse,
  NotificationLog,
  NotificationStatus,
  NotificationType,
} from './contracts/notifications/v1.js';

export type {
  UserProfile,
  UserProfilePayload,
  WorkAuthorization,
} from './contracts/profile/v1.js';

export type {
  TrackerDiscoveryAction,
  TrackerDiscoveryActionRequest,
  TrackerDiscoveryActionResponse,
  TrackedJobState,
  TrackerHistoryResponse,
  TrackerJobListResponse,
  TrackerJobStateResponse,
  TrackerState,
  TrackerTransitionEvent,
  TrackerTransitionRequest,
  TrackerTransitionResponse,
} from './contracts/tracker/v1.js';
