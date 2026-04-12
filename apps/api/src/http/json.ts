import type { IncomingMessage, ServerResponse } from 'node:http';

import { HttpError } from './http-errors.js';

const MAX_JSON_BYTES = 1_000_000;

export const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const chunkBuffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk));
    size += chunkBuffer.byteLength;

    if (size > MAX_JSON_BYTES) {
      throw new HttpError(413, 'payload_too_large');
    }

    chunks.push(chunkBuffer);
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();
  if (body.length === 0) {
    return {};
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, 'invalid_json_body');
  }
};

export const sendJson = (
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void => {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
