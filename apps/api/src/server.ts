import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { isHttpError } from './http/http-errors.js';
import { sendJson } from './http/json.js';
import { createInMemoryAuthProfileRepository } from './modules/auth-profile/in-memory-repository.js';
import { handleAuthProfileRoutes } from './modules/auth-profile/routes.js';
import {
  createAuthProfileService,
  type AuthProfileService,
} from './modules/auth-profile/service.js';

const defaultAuthProfileService = createAuthProfileService({
  repository: createInMemoryAuthProfileRepository(),
});

export interface CreateApiServerOptions {
  authProfileService?: AuthProfileService;
}

const isHealthRequest = (req: IncomingMessage): boolean =>
  req.method === 'GET' && req.url === '/health';

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  authProfileService: AuthProfileService,
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
}: CreateApiServerOptions = {}): Server =>
  createServer((req, res) => {
    void handleRequest(req, res, authProfileService).catch((error: unknown) => {
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
