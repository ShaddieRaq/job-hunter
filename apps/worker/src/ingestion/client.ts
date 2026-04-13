import {
  authContractVersion,
  authSessionSchema,
  canonicalRebuildResponseSchema,
  connectorListResponseSchema,
  connectorSyncResponseSchema,
  type CanonicalRebuildResponse,
  type ConnectorSyncResponse,
  type SourceName,
} from '@job-hunter/shared';

const defaultTimeoutMs = 20_000;

export interface IngestionApiClient {
  listConnectorNames(): Promise<SourceName[]>;
  syncConnector(
    sourceName: SourceName,
    maxRecords: number,
  ): Promise<ConnectorSyncResponse>;
  rebuildCanonicalCatalog(maxSourceJobs: number): Promise<CanonicalRebuildResponse>;
}

export interface CreateIngestionApiClientOptions {
  apiBaseUrl: string;
  workerEmail: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface AuthSessionEnvelope {
  contractVersion: typeof authContractVersion;
  session: {
    accessToken: string;
  };
}

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown_error';
};

const parseApiError = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const errorCode = payloadRecord.error;
  if (typeof errorCode !== 'string' || errorCode.length === 0) {
    return null;
  }

  return errorCode;
};

const parseAuthSessionEnvelope = (payload: unknown): AuthSessionEnvelope => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid_auth_session_response_shape');
  }

  const payloadRecord = payload as Record<string, unknown>;
  if (payloadRecord.contractVersion !== authContractVersion) {
    throw new Error('invalid_auth_contract_version');
  }

  const parsedSession = authSessionSchema.safeParse(payloadRecord.session);
  if (!parsedSession.success) {
    throw new Error('invalid_auth_session_payload');
  }

  return {
    contractVersion: authContractVersion,
    session: {
      accessToken: parsedSession.data.accessToken,
    },
  };
};

const parseJsonResponseBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const createIngestionApiClient = ({
  apiBaseUrl,
  workerEmail,
  fetchImpl = fetch,
  timeoutMs = defaultTimeoutMs,
}: CreateIngestionApiClientOptions): IngestionApiClient => {
  const normalizedApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
  const normalizedEmail = workerEmail.trim().toLowerCase();
  let cachedAccessToken: string | null = null;

  if (normalizedEmail.length === 0) {
    throw new Error('worker_email_required');
  }

  const fetchWithTimeout = async (
    path: string,
    init: RequestInit,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      return await fetchImpl(`${normalizedApiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const requestAuthSession = async (
    mode: 'login' | 'register',
  ): Promise<AuthSessionEnvelope> => {
    const response = await fetchWithTimeout(`/v1/auth/${mode}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
      }),
    });

    const body = await parseJsonResponseBody(response);

    if (!response.ok) {
      const apiError = parseApiError(body);
      throw new Error(
        apiError
          ? `${mode} failed (${response.status}): ${apiError}`
          : `${mode} failed (${response.status})`,
      );
    }

    return parseAuthSessionEnvelope(body);
  };

  const getOrCreateAccessToken = async (): Promise<string> => {
    if (cachedAccessToken) {
      return cachedAccessToken;
    }

    try {
      const loginSession = await requestAuthSession('login');
      cachedAccessToken = loginSession.session.accessToken;
      return cachedAccessToken;
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error);
      if (!errorMessage.includes('user_not_found')) {
        throw error;
      }
    }

    try {
      const registerSession = await requestAuthSession('register');
      cachedAccessToken = registerSession.session.accessToken;
      return cachedAccessToken;
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error);
      if (!errorMessage.includes('email_already_registered')) {
        throw error;
      }
    }

    const loginSession = await requestAuthSession('login');
    cachedAccessToken = loginSession.session.accessToken;
    return cachedAccessToken;
  };

  const authedRequest = async (
    path: string,
    init: RequestInit,
  ): Promise<{ response: Response; body: unknown }> => {
    const performRequest = async (accessToken: string): Promise<{
      response: Response;
      body: unknown;
    }> => {
      const headers = new Headers(init.headers ?? {});
      headers.set('authorization', `Bearer ${accessToken}`);

      const response = await fetchWithTimeout(path, {
        ...init,
        headers,
      });

      return {
        response,
        body: await parseJsonResponseBody(response),
      };
    };

    let accessToken = await getOrCreateAccessToken();
    let result = await performRequest(accessToken);

    if (result.response.status !== 401) {
      return result;
    }

    cachedAccessToken = null;
    accessToken = await getOrCreateAccessToken();
    result = await performRequest(accessToken);
    return result;
  };

  const assertOkOrThrow = (
    response: Response,
    body: unknown,
    operation: string,
  ): void => {
    if (response.ok) {
      return;
    }

    const apiError = parseApiError(body);
    throw new Error(
      apiError
        ? `${operation} failed (${response.status}): ${apiError}`
        : `${operation} failed (${response.status})`,
    );
  };

  return {
    async listConnectorNames(): Promise<SourceName[]> {
      const { response, body } = await authedRequest('/v1/connectors', {
        method: 'GET',
      });

      assertOkOrThrow(response, body, 'list_connectors');

      const parsed = connectorListResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error('invalid_connector_list_response');
      }

      return parsed.data.connectors.map((connector) => connector.sourceName);
    },

    async syncConnector(
      sourceName: SourceName,
      maxRecords: number,
    ): Promise<ConnectorSyncResponse> {
      const { response, body } = await authedRequest(
        `/v1/connectors/${sourceName}/sync`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            maxRecords,
          }),
        },
      );

      assertOkOrThrow(response, body, `sync_connector:${sourceName}`);

      const parsed = connectorSyncResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error(`invalid_connector_sync_response:${sourceName}`);
      }

      return parsed.data;
    },

    async rebuildCanonicalCatalog(maxSourceJobs: number): Promise<CanonicalRebuildResponse> {
      const { response, body } = await authedRequest('/v1/canonical-jobs/rebuild', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          maxSourceJobs,
        }),
      });

      assertOkOrThrow(response, body, 'rebuild_canonical_catalog');

      const parsed = canonicalRebuildResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error('invalid_rebuild_response');
      }

      return parsed.data;
    },
  };
};
