import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { isHttpError } from './http/http-errors.js';
import { sendJson } from './http/json.js';
import { getSharedPostgresPool } from './db/postgres.js';
import { createInMemoryAuthProfileRepository } from './modules/auth-profile/in-memory-repository.js';
import { handleAuthProfileRoutes } from './modules/auth-profile/routes.js';
import {
  createAuthProfileService,
  type AuthProfileService,
} from './modules/auth-profile/service.js';
import { handleAiRoutes } from './modules/ai/routes.js';
import { createAiService, type AiService } from './modules/ai/service.js';
import { createInMemoryCanonicalJobRepository } from './modules/canonical-jobs/in-memory-repository.js';
import { createPostgresCanonicalJobRepository } from './modules/canonical-jobs/postgres-repository.js';
import { handleCanonicalJobRoutes } from './modules/canonical-jobs/routes.js';
import {
  createCanonicalJobsService,
  type CanonicalJobsService,
} from './modules/canonical-jobs/service.js';
import { createGreenhousePublicBoardConnector } from './modules/connectors/greenhouse-public-board-connector.js';
import { createInMemoryConnectorRepository } from './modules/connectors/in-memory-repository.js';
import { createPostgresConnectorRepository } from './modules/connectors/postgres-repository.js';
import { handleConnectorRoutes } from './modules/connectors/routes.js';
import {
  createConnectorService,
  type ConnectorService,
} from './modules/connectors/service.js';
import { createInMemoryObjectStorage } from './modules/resume/in-memory-object-storage.js';
import { createInMemoryResumeRepository } from './modules/resume/in-memory-repository.js';
import { createHeuristicResumeParser } from './modules/resume/parser.js';
import { handleResumeRoutes } from './modules/resume/routes.js';
import { createResumeService, type ResumeService } from './modules/resume/service.js';
import { handleTrackerRoutes } from './modules/tracker/routes.js';
import { createTrackerService, type TrackerService } from './modules/tracker/service.js';

const defaultAuthProfileService = createAuthProfileService({
  repository: createInMemoryAuthProfileRepository(),
});

const defaultAiService = createAiService();

const postgresPool = getSharedPostgresPool();

const connectorRepositoryMode = (
  process.env.CONNECTOR_REPOSITORY ?? 'in-memory'
).toLowerCase();

const canonicalRepositoryMode = (
  process.env.CANONICAL_JOBS_REPOSITORY ?? 'in-memory'
).toLowerCase();

const resolveConnectorRepository = () => {
  if (connectorRepositoryMode === 'postgres') {
    if (!postgresPool) {
      throw new Error(
        'CONNECTOR_REPOSITORY=postgres requires DATABASE_URL to be set',
      );
    }

    return createPostgresConnectorRepository(postgresPool);
  }

  return createInMemoryConnectorRepository();
};

const resolveCanonicalRepository = () => {
  if (canonicalRepositoryMode === 'postgres') {
    if (!postgresPool) {
      throw new Error(
        'CANONICAL_JOBS_REPOSITORY=postgres requires DATABASE_URL to be set',
      );
    }

    return createPostgresCanonicalJobRepository(postgresPool);
  }

  return createInMemoryCanonicalJobRepository();
};

const defaultConnectorService = createConnectorService({
  repository: resolveConnectorRepository(),
  connectors: [
    createGreenhousePublicBoardConnector({
      boardToken: process.env.GREENHOUSE_BOARD_TOKEN ?? 'stripe',
      sourceName: 'greenhouse_public_board',
      displayName: 'Greenhouse Public Board',
    }),
  ],
});

const defaultCanonicalJobsService = createCanonicalJobsService({
  sourceJobReader: defaultConnectorService,
  repository: resolveCanonicalRepository(),
});

const defaultResumeService = createResumeService({
  repository: createInMemoryResumeRepository(),
  objectStorage: createInMemoryObjectStorage(),
  parser: createHeuristicResumeParser(),
});

const defaultTrackerService = createTrackerService({
  canonicalJobLookup: defaultCanonicalJobsService,
});

export interface CreateApiServerOptions {
  authProfileService?: AuthProfileService;
  resumeService?: ResumeService;
  aiService?: AiService;
  connectorService?: ConnectorService;
  canonicalJobsService?: CanonicalJobsService;
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
  });

  if (canonicalHandled) {
    return;
  }

  const trackerHandled = await handleTrackerRoutes(req, res, {
    authProfileService,
    trackerService,
  });

  if (trackerHandled) {
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
