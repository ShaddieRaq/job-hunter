import { createDeterministicAiProvider, deterministicAiProviderId } from './deterministic-provider.js';
import { createOpenAiAiProvider } from './openai-provider.js';
import type { AiProvider } from './types.js';

export interface CreatePrimaryAiProviderFromEnvOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

const parsePreferredProvider = (
  rawProvider: string | undefined,
): 'auto' | 'deterministic' | 'openai' => {
  const normalized = rawProvider?.trim().toLowerCase();

  if (normalized === 'openai') {
    return 'openai';
  }

  if (normalized === 'deterministic') {
    return 'deterministic';
  }

  return 'auto';
};

const parseTimeout = (rawTimeout: string | undefined): number | undefined => {
  if (!rawTimeout) {
    return undefined;
  }

  const timeout = Number(rawTimeout);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    return undefined;
  }

  return timeout;
};

const parseOptionalString = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized;
};

export const createPrimaryAiProviderFromEnv = ({
  env = process.env,
  fetchImpl,
}: CreatePrimaryAiProviderFromEnvOptions = {}): AiProvider => {
  const preferredProvider = parsePreferredProvider(env.AI_PROVIDER);
  const openAiApiKey = env.OPENAI_API_KEY?.trim();

  if (
    (preferredProvider === 'openai' || preferredProvider === 'auto') &&
    openAiApiKey
  ) {
    return createOpenAiAiProvider({
      apiKey: openAiApiKey,
      model: parseOptionalString(env.OPENAI_MODEL),
      baseUrl: parseOptionalString(env.OPENAI_BASE_URL),
      timeoutMs: parseTimeout(env.OPENAI_TIMEOUT_MS),
      fetchImpl,
    });
  }

  return createDeterministicAiProvider();
};

export const createFallbackAiProviderFromEnv = (
  primaryProvider: AiProvider,
  env: NodeJS.ProcessEnv = process.env,
): AiProvider | null => {
  const fallbackMode = env.AI_PROVIDER_FALLBACK?.trim().toLowerCase() ?? 'deterministic';

  if (fallbackMode === 'none' || primaryProvider.providerId === deterministicAiProviderId) {
    return null;
  }

  return createDeterministicAiProvider();
};