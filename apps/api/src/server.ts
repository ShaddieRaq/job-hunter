import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { isHttpError } from './http/http-errors.js';
import { sendJson } from './http/json.js';
import { getSharedPostgresPool } from './db/postgres.js';
import { handleApplicationRoutes } from './modules/applications/routes.js';
import {
  createApplicationService,
  type ApplicationService,
} from './modules/applications/service.js';
import { createPostgresApplicationRepository } from './modules/applications/postgres-repository.js';
import { createInMemoryAuthProfileRepository } from './modules/auth-profile/in-memory-repository.js';
import { createPostgresAuthProfileRepository } from './modules/auth-profile/postgres-repository.js';
import { handleAuthProfileRoutes } from './modules/auth-profile/routes.js';
import {
  createAuthProfileService,
  type AuthProfileService,
} from './modules/auth-profile/service.js';
import { createInMemoryAtsTargetRegistryRepository } from './modules/ats-target-registry/in-memory-repository.js';
import { createInMemoryAtsTargetVerificationEventRepository } from './modules/ats-target-registry/in-memory-repository.js';
import { createPostgresAtsTargetRegistryRepository } from './modules/ats-target-registry/postgres-repository.js';
import { createPostgresAtsTargetVerificationEventRepository } from './modules/ats-target-registry/postgres-repository.js';
import { handleAtsTargetRegistryRoutes } from './modules/ats-target-registry/routes.js';
import {
  createAtsTargetRegistryService,
  type AtsTargetRegistryService,
} from './modules/ats-target-registry/service.js';
import {
  createAtsTargetVerificationEventService,
  type AtsTargetVerificationEventService,
} from './modules/ats-target-registry/verification-events-service.js';
import { handleAiRoutes } from './modules/ai/routes.js';
import { createAiService, type AiService } from './modules/ai/service.js';
import { createInMemoryCanonicalJobRepository } from './modules/canonical-jobs/in-memory-repository.js';
import { createPostgresCanonicalJobRepository } from './modules/canonical-jobs/postgres-repository.js';
import { handleCanonicalJobRoutes } from './modules/canonical-jobs/routes.js';
import {
  createCanonicalJobsService,
  type CanonicalJobsService,
} from './modules/canonical-jobs/service.js';
import { createArbeitnowJobBoardConnector } from './modules/connectors/arbeitnow-job-board-connector.js';
import { createGreenhousePublicBoardConnectors } from './modules/connectors/greenhouse-board-connectors.js';
import { createLeverPublicBoardConnectors } from './modules/connectors/lever-board-connectors.js';
import { createInMemoryConnectorRepository } from './modules/connectors/in-memory-repository.js';
import { createPostgresConnectorRepository } from './modules/connectors/postgres-repository.js';
import { handleConnectorRoutes } from './modules/connectors/routes.js';
import {
  createConnectorService,
  type ConnectorService,
} from './modules/connectors/service.js';
import { handleNotificationRoutes } from './modules/notifications/routes.js';
import {
  createNotificationService,
  type NotificationService,
} from './modules/notifications/service.js';
import { createPostgresNotificationRepository } from './modules/notifications/postgres-repository.js';
import { createPostgresReminderRepository } from './modules/reminders/postgres-repository.js';
import { createInMemoryObjectStorage } from './modules/resume/in-memory-object-storage.js';
import { createInMemoryResumeRepository } from './modules/resume/in-memory-repository.js';
import { createFilesystemObjectStorage } from './modules/resume/filesystem-object-storage.js';
import { createHeuristicResumeParser } from './modules/resume/parser.js';
import { createPostgresResumeRepository } from './modules/resume/postgres-repository.js';
import { handleResumeRoutes } from './modules/resume/routes.js';
import { createResumeService, type ResumeService } from './modules/resume/service.js';
import { handleSavedSearchRoutes } from './modules/saved-searches/routes.js';
import {
  createSavedSearchService,
  type SavedSearchService,
} from './modules/saved-searches/service.js';
import { createPostgresSavedSearchRepository } from './modules/saved-searches/postgres-repository.js';
import { handleReminderRoutes } from './modules/reminders/routes.js';
import {
  createReminderService,
  type ReminderService,
} from './modules/reminders/service.js';
import { handleTrackerRoutes } from './modules/tracker/routes.js';
import { createTrackerService, type TrackerService } from './modules/tracker/service.js';
import { createPostgresTrackerRepository } from './modules/tracker/postgres-repository.js';
import type { AtsTargetRegistryPersistenceRepository } from './modules/ats-target-registry/repository.js';

const postgresPool = getSharedPostgresPool();

const defaultAiService = createAiService();

const apiRuntimeMode = (
  process.env.API_RUNTIME_MODE ?? 'development'
).toLowerCase();

const workflowRepositoryMode = (
  process.env.WORKFLOW_REPOSITORY ?? (postgresPool ? 'postgres' : 'in-memory')
).toLowerCase();

const connectorRepositoryMode = (
  process.env.CONNECTOR_REPOSITORY ?? (postgresPool ? 'postgres' : 'in-memory')
).toLowerCase();

const canonicalRepositoryMode = (
  process.env.CANONICAL_JOBS_REPOSITORY ?? (postgresPool ? 'postgres' : 'in-memory')
).toLowerCase();

const atsTargetRegistryRepositoryMode = (
  process.env.ATS_TARGET_REGISTRY_REPOSITORY ?? (postgresPool ? 'postgres' : 'in-memory')
).toLowerCase();

const resolvePostgresPool = (requiredBy: string) => {
  if (!postgresPool) {
    throw new Error(`${requiredBy} requires DATABASE_URL to be set`);
  }

  return postgresPool;
};

const resolveAuthProfileRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresAuthProfileRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return createInMemoryAuthProfileRepository();
};

const resolveResumeRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresResumeRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return createInMemoryResumeRepository();
};

const resolveApplicationRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresApplicationRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return undefined;
};

const resolveTrackerRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresTrackerRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return undefined;
};

const resolveReminderRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresReminderRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return undefined;
};

const resolveNotificationRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresNotificationRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return undefined;
};

const resolveSavedSearchRepository = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createPostgresSavedSearchRepository(
      resolvePostgresPool('WORKFLOW_REPOSITORY=postgres'),
    );
  }

  return undefined;
};

const resolveObjectStorage = () => {
  if (workflowRepositoryMode === 'postgres') {
    return createFilesystemObjectStorage({
      rootDirectory: process.env.RESUME_OBJECT_STORAGE_DIR ?? '.data/resumes',
    });
  }

  return createInMemoryObjectStorage();
};

const ensureDurableRuntimeConfiguration = (): void => {
  if (apiRuntimeMode !== 'validation' && apiRuntimeMode !== 'production') {
    return;
  }

  if (workflowRepositoryMode !== 'postgres') {
    throw new Error(
      'API_RUNTIME_MODE requires WORKFLOW_REPOSITORY=postgres for durable workflow data',
    );
  }

  if (connectorRepositoryMode !== 'postgres') {
    throw new Error(
      'API_RUNTIME_MODE requires CONNECTOR_REPOSITORY=postgres for durable source ingestion data',
    );
  }

  if (canonicalRepositoryMode !== 'postgres') {
    throw new Error(
      'API_RUNTIME_MODE requires CANONICAL_JOBS_REPOSITORY=postgres for durable canonical catalog data',
    );
  }

  if (atsTargetRegistryRepositoryMode !== 'postgres') {
    throw new Error(
      'API_RUNTIME_MODE requires ATS_TARGET_REGISTRY_REPOSITORY=postgres for durable ATS target lifecycle data',
    );
  }

  resolvePostgresPool('API_RUNTIME_MODE=validation|production');
};

ensureDurableRuntimeConfiguration();

const defaultAuthProfileService = createAuthProfileService({
  repository: resolveAuthProfileRepository(),
});

const resolveConnectorRepository = () => {
  if (connectorRepositoryMode === 'postgres') {
    return createPostgresConnectorRepository(
      resolvePostgresPool('CONNECTOR_REPOSITORY=postgres'),
    );
  }

  return createInMemoryConnectorRepository();
};

const resolveCanonicalRepository = () => {
  if (canonicalRepositoryMode === 'postgres') {
    return createPostgresCanonicalJobRepository(
      resolvePostgresPool('CANONICAL_JOBS_REPOSITORY=postgres'),
    );
  }

  return createInMemoryCanonicalJobRepository();
};

const resolveAtsTargetRegistryRepository = () => {
  if (atsTargetRegistryRepositoryMode === 'postgres') {
    return createPostgresAtsTargetRegistryRepository(
      resolvePostgresPool('ATS_TARGET_REGISTRY_REPOSITORY=postgres'),
    );
  }

  return createInMemoryAtsTargetRegistryRepository();
};

const resolveAtsTargetVerificationEventRepository = (
  targetRepository: AtsTargetRegistryPersistenceRepository,
) => {
  if (atsTargetRegistryRepositoryMode === 'postgres') {
    return createPostgresAtsTargetVerificationEventRepository(
      resolvePostgresPool('ATS_TARGET_REGISTRY_REPOSITORY=postgres'),
    );
  }

  return createInMemoryAtsTargetVerificationEventRepository({
    async resolveVendorByTargetId(targetId) {
      const target = await targetRepository.findAtsTargetById(targetId);
      return target?.atsVendor ?? null;
    },
  });
};

const defaultAtsTargetRegistryRepository = resolveAtsTargetRegistryRepository();

const defaultConnectorService = createConnectorService({
  repository: resolveConnectorRepository(),
  connectors: [
    ...createGreenhousePublicBoardConnectors({
      boardTokenEnv: process.env.GREENHOUSE_BOARD_TOKEN,
      boardTokensEnv: process.env.GREENHOUSE_BOARD_TOKENS,
    }),
    ...createLeverPublicBoardConnectors({
      companyHandleEnv: process.env.LEVER_COMPANY_HANDLE,
      companyHandlesEnv: process.env.LEVER_COMPANY_HANDLES,
    }),
    createArbeitnowJobBoardConnector({
      sourceName: 'arbeitnow_job_board',
      displayName: 'Arbeitnow Job Board',
      endpointBaseUrl:
        process.env.ARBEITNOW_API_BASE_URL ?? 'https://www.arbeitnow.com/api/job-board-api',
    }),
  ],
});

const defaultCanonicalJobsService = createCanonicalJobsService({
  sourceJobReader: defaultConnectorService,
  repository: resolveCanonicalRepository(),
});

const defaultAtsTargetRegistryService = createAtsTargetRegistryService({
  repository: defaultAtsTargetRegistryRepository,
});

const defaultAtsTargetVerificationEventService =
  createAtsTargetVerificationEventService({
    repository: resolveAtsTargetVerificationEventRepository(
      defaultAtsTargetRegistryRepository,
    ),
});

const defaultResumeService = createResumeService({
  repository: resolveResumeRepository(),
  objectStorage: resolveObjectStorage(),
  parser: createHeuristicResumeParser(),
});

const defaultApplicationService = createApplicationService({
  canonicalJobLookup: defaultCanonicalJobsService,
  resumeLookup: defaultResumeService,
  repository: resolveApplicationRepository(),
});

const defaultReminderService = createReminderService({
  canonicalJobLookup: defaultCanonicalJobsService,
  repository: resolveReminderRepository(),
});

const defaultTrackerService = createTrackerService({
  canonicalJobLookup: defaultCanonicalJobsService,
  repository: resolveTrackerRepository(),
  transitionObservers: [defaultReminderService],
});

const defaultNotificationService = createNotificationService({
  reminderReader: defaultReminderService,
  highFitCandidateReader: {
    async listCandidates({ userId, limit }) {
      const jobs = await defaultCanonicalJobsService.listCanonicalJobs(limit);

      return Promise.all(
        jobs.map(async (job) => {
          const [latestScoreArtifact, trackedJob] = await Promise.all([
            defaultAiService.getLatestMatchArtifact(userId, job.canonicalJobId),
            defaultTrackerService.getTrackedJob(userId, job.canonicalJobId),
          ]);

          return {
            canonicalJobId: job.canonicalJobId,
            canonicalCompanyName: job.canonicalCompanyName,
            canonicalTitle: job.canonicalTitle,
            latestScoreArtifact,
            trackerState: trackedJob?.state ?? null,
          };
        }),
      );
    },
  },
  userIdReader: {
    async listUserIds(limit) {
      return defaultAuthProfileService.listUserIds(limit);
    },
  },
  repository: resolveNotificationRepository(),
});

const defaultSavedSearchService = createSavedSearchService({
  repository: resolveSavedSearchRepository(),
});

export interface CreateApiServerOptions {
  authProfileService?: AuthProfileService;
  resumeService?: ResumeService;
  aiService?: AiService;
  connectorService?: ConnectorService;
  canonicalJobsService?: CanonicalJobsService;
  atsTargetRegistryService?: AtsTargetRegistryService;
  atsTargetVerificationEventService?: AtsTargetVerificationEventService;
  applicationService?: ApplicationService;
  reminderService?: ReminderService;
  notificationService?: NotificationService;
  savedSearchService?: SavedSearchService;
  trackerService?: TrackerService;
}

const isHealthRequest = (req: IncomingMessage): boolean =>
  req.method === 'GET' && req.url === '/health';

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  authProfileService: AuthProfileService,
  resumeService: ResumeService,
  aiService: AiService,
  connectorService: ConnectorService,
  canonicalJobsService: CanonicalJobsService,
  atsTargetRegistryService: AtsTargetRegistryService,
  atsTargetVerificationEventService: AtsTargetVerificationEventService,
  applicationService: ApplicationService,
  reminderService: ReminderService,
  notificationService: NotificationService,
  savedSearchService: SavedSearchService,
  trackerService: TrackerService,
): Promise<void> => {
  if (isHealthRequest(req)) {
    sendJson(res, 200, { status: 'ok', service: 'api' });
    return;
  }

  const handled = await handleAuthProfileRoutes(req, res, {
    service: authProfileService,
  });

  if (handled) {
    return;
  }

  const resumeHandled = await handleResumeRoutes(req, res, {
    authProfileService,
    resumeService,
  });

  if (resumeHandled) {
    return;
  }

  const aiHandled = await handleAiRoutes(req, res, {
    authProfileService,
    aiService,
  });

  if (aiHandled) {
    return;
  }

  const connectorHandled = await handleConnectorRoutes(req, res, {
    authProfileService,
    connectorService,
  });

  if (connectorHandled) {
    return;
  }

  const canonicalHandled = await handleCanonicalJobRoutes(req, res, {
    authProfileService,
    canonicalJobsService,
    aiService,
    trackerService,
    connectorService,
    applicationService,
    reminderService,
  });

  if (canonicalHandled) {
    return;
  }

  const atsTargetRegistryHandled = await handleAtsTargetRegistryRoutes(req, res, {
    authProfileService,
    atsTargetRegistryService,
    atsTargetVerificationEventService,
  });

  if (atsTargetRegistryHandled) {
    return;
  }

  const applicationHandled = await handleApplicationRoutes(req, res, {
    authProfileService,
    applicationService,
  });

  if (applicationHandled) {
    return;
  }

  const trackerHandled = await handleTrackerRoutes(req, res, {
    authProfileService,
    trackerService,
  });

  if (trackerHandled) {
    return;
  }

  const savedSearchHandled = await handleSavedSearchRoutes(req, res, {
    authProfileService,
    savedSearchService,
  });

  if (savedSearchHandled) {
    return;
  }

  const reminderHandled = await handleReminderRoutes(req, res, {
    authProfileService,
    reminderService,
  });

  if (reminderHandled) {
    return;
  }

  const notificationHandled = await handleNotificationRoutes(req, res, {
    authProfileService,
    notificationService,
  });

  if (notificationHandled) {
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
};

const handleUnhandledError = (res: ServerResponse, error: unknown): void => {
  if (isHttpError(error)) {
    sendJson(res, error.statusCode, {
      error: error.code,
      details: error.details ?? null,
    });
    return;
  }

  sendJson(res, 500, {
    error: 'internal_server_error',
  });
};

export const createApiServer = ({
  authProfileService = defaultAuthProfileService,
  resumeService = defaultResumeService,
  aiService = defaultAiService,
  connectorService = defaultConnectorService,
  canonicalJobsService = defaultCanonicalJobsService,
  atsTargetRegistryService = defaultAtsTargetRegistryService,
  atsTargetVerificationEventService = defaultAtsTargetVerificationEventService,
  applicationService = defaultApplicationService,
  reminderService = defaultReminderService,
  notificationService = defaultNotificationService,
  savedSearchService = defaultSavedSearchService,
  trackerService = defaultTrackerService,
}: CreateApiServerOptions = {}): Server =>
  createServer((req, res) => {
    void handleRequest(
      req,
      res,
      authProfileService,
      resumeService,
      aiService,
      connectorService,
      canonicalJobsService,
      atsTargetRegistryService,
      atsTargetVerificationEventService,
      applicationService,
      reminderService,
      notificationService,
      savedSearchService,
      trackerService,
    ).catch((error: unknown) => {
      handleUnhandledError(res, error);
    });
  });

export const startApiServer = (port: number): Server => {
  const server = createApiServer();

  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  return server;
};
