import type { AiProviderFailureCode } from './types.js';

export interface AiProviderErrorOptions {
  providerId: string;
  message?: string;
  details?: unknown;
  cause?: unknown;
}

export class AiProviderError extends Error {
  public readonly code: AiProviderFailureCode;
  public readonly providerId: string;
  public readonly details?: unknown;

  public constructor(code: AiProviderFailureCode, options: AiProviderErrorOptions) {
    super(options.message ?? code, {
      cause: options.cause,
    });

    this.code = code;
    this.providerId = options.providerId;
    this.details = options.details;
  }
}

export const isAiProviderError = (value: unknown): value is AiProviderError =>
  value instanceof AiProviderError;