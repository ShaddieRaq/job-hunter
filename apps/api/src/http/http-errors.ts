export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(statusCode: number, code: string, details?: unknown) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const isHttpError = (value: unknown): value is HttpError =>
  value instanceof HttpError;
