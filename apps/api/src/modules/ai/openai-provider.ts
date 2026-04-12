import {
  extractedJobSchema,
  extractedResumeSchema,
  matchExplanationSchema,
  type JobExtractionRequest,
  type MatchExplanationRequest,
  type ResumeExtractionRequest,
} from '@job-hunter/shared';

import { AiProviderError, isAiProviderError } from './errors.js';
import type { AiProvider, AiProviderResult } from './types.js';

export const openAiAiProviderId = 'openai';

const openAiExtractorVersion = 'openai-chat-completions-v1';
const defaultOpenAiModel = 'gpt-4.1-mini';
const defaultOpenAiBaseUrl = 'https://api.openai.com/v1';
const defaultTimeoutMs = 20_000;

type JsonObject = Record<string, unknown>;

type SafeParseSchema<T> = {
  safeParse: (value: unknown) =>
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: Array<{
            code: string;
            message: string;
            path: (string | number)[];
          }>;
        };
      };
};

interface OpenAiChatCompletionResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
}

export interface CreateOpenAiAiProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const boundedStringSchema = (maxLength: number): JsonObject => ({
  type: 'string',
  minLength: 1,
  maxLength,
});

const boundedStringArraySchema = (maxItems: number, maxLength: number): JsonObject => ({
  type: 'array',
  items: boundedStringSchema(maxLength),
  maxItems,
});

const nullableSchema = (schema: JsonObject): JsonObject => ({
  anyOf: [schema, { type: 'null' }],
});

const yearsOfExperienceJsonSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['minimum', 'maximum'],
  properties: {
    minimum: nullableSchema({ type: 'integer', minimum: 0, maximum: 50 }),
    maximum: nullableSchema({ type: 'integer', minimum: 0, maximum: 50 }),
  },
};

const seniorityEnum = ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'];
const remotePreferenceEnum = ['remote', 'hybrid', 'onsite', 'flexible'];

const extractedResumeJsonSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'normalizedSkills',
    'domains',
    'experienceRoles',
    'yearsExperience',
    'inferredSeniority',
    'preferredLocations',
    'remotePreference',
    'sponsorshipRequired',
    'workAuthorization',
  ],
  properties: {
    normalizedSkills: boundedStringArraySchema(300, 120),
    domains: boundedStringArraySchema(80, 120),
    experienceRoles: boundedStringArraySchema(120, 120),
    yearsExperience: yearsOfExperienceJsonSchema,
    inferredSeniority: nullableSchema({
      type: 'string',
      enum: seniorityEnum,
    }),
    preferredLocations: boundedStringArraySchema(30, 120),
    remotePreference: nullableSchema({
      type: 'string',
      enum: remotePreferenceEnum,
    }),
    sponsorshipRequired: nullableSchema({ type: 'boolean' }),
    workAuthorization: nullableSchema(boundedStringSchema(120)),
  },
};

const extractedJobJsonSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'normalizedTitle',
    'normalizedSkills',
    'requiredSkills',
    'preferredSkills',
    'requiredYearsExperience',
    'domainTags',
    'seniority',
    'locationConstraint',
    'remoteType',
    'sponsorshipAvailable',
    'salaryMin',
    'salaryMax',
    'salaryCurrency',
    'salaryPeriod',
  ],
  properties: {
    normalizedTitle: boundedStringSchema(180),
    normalizedSkills: boundedStringArraySchema(300, 120),
    requiredSkills: boundedStringArraySchema(200, 120),
    preferredSkills: boundedStringArraySchema(200, 120),
    requiredYearsExperience: yearsOfExperienceJsonSchema,
    domainTags: boundedStringArraySchema(100, 120),
    seniority: nullableSchema({
      type: 'string',
      enum: seniorityEnum,
    }),
    locationConstraint: nullableSchema(boundedStringSchema(120)),
    remoteType: nullableSchema({
      type: 'string',
      enum: remotePreferenceEnum,
    }),
    sponsorshipAvailable: nullableSchema({ type: 'boolean' }),
    salaryMin: nullableSchema({ type: 'integer', minimum: 0 }),
    salaryMax: nullableSchema({ type: 'integer', minimum: 0 }),
    salaryCurrency: nullableSchema(boundedStringSchema(12)),
    salaryPeriod: nullableSchema({
      type: 'string',
      enum: ['hour', 'month', 'year'],
    }),
  },
};

const matchExplanationJsonSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'strengths', 'gaps', 'dealBreakers', 'recommendation'],
  properties: {
    summary: boundedStringSchema(320),
    strengths: boundedStringArraySchema(10, 240),
    gaps: boundedStringArraySchema(10, 240),
    dealBreakers: boundedStringArraySchema(10, 240),
    recommendation: {
      type: 'string',
      enum: ['apply', 'review', 'skip'],
    },
  },
};

const mapValidationIssues = (
  issues: Array<{ code: string; message: string; path: (string | number)[] }>,
): Array<{ code: string; message: string; path: string }> =>
  issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join('.'),
  }));

const parseStructuredContent = <T>(
  rawContent: string,
  schema: SafeParseSchema<T>,
): T => {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent) as unknown;
  } catch (error: unknown) {
    throw new AiProviderError('invalid_json_schema', {
      providerId: openAiAiProviderId,
      message: 'provider returned invalid JSON content',
      cause: error,
    });
  }

  const validated = schema.safeParse(parsedJson);
  if (!validated.success) {
    throw new AiProviderError('invalid_json_schema', {
      providerId: openAiAiProviderId,
      message: 'provider JSON failed schema validation',
      details: {
        issues: mapValidationIssues(validated.error.issues),
      },
    });
  }

  return validated.data;
};

const buildRequestBody = (
  model: string,
  schemaName: string,
  schema: JsonObject,
  systemPrompt: string,
  userPrompt: string,
): JsonObject => ({
  model,
  temperature: 0,
  messages: [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: schemaName,
      strict: true,
      schema,
    },
  },
});

const invokeStructuredOutput = async <T>(
  options: {
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    fetchImpl: typeof fetch;
    schemaName: string;
    jsonSchema: JsonObject;
    validator: SafeParseSchema<T>;
    systemPrompt: string;
    userPrompt: string;
  },
): Promise<AiProviderResult<T>> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs);

  try {
    const response = await options.fetchImpl(
      `${options.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          buildRequestBody(
            options.model,
            options.schemaName,
            options.jsonSchema,
            options.systemPrompt,
            options.userPrompt,
          ),
        ),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      let errorBody: unknown = null;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }

      throw new AiProviderError('provider_http_error', {
        providerId: openAiAiProviderId,
        message: 'provider returned non-success status',
        details: {
          status: response.status,
          body: errorBody,
        },
      });
    }

    const responseBody = (await response.json()) as OpenAiChatCompletionResponse;
    const choice = responseBody.choices?.[0];
    if (!choice) {
      throw new AiProviderError('invalid_json_schema', {
        providerId: openAiAiProviderId,
        message: 'provider returned no completion choices',
      });
    }

    if (choice.message?.refusal && choice.message.refusal.trim().length > 0) {
      throw new AiProviderError('provider_refusal', {
        providerId: openAiAiProviderId,
        message: choice.message.refusal,
      });
    }

    if (choice.finish_reason === 'content_filter') {
      throw new AiProviderError('provider_refusal', {
        providerId: openAiAiProviderId,
        message: 'provider content filter refusal',
      });
    }

    const rawContent = choice.message?.content;
    if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
      throw new AiProviderError('invalid_json_schema', {
        providerId: openAiAiProviderId,
        message: 'provider returned empty structured content',
      });
    }

    const output = parseStructuredContent(rawContent, options.validator);

    return {
      output,
      extractorVersion: openAiExtractorVersion,
      modelVersion: responseBody.model?.trim() || options.model,
    };
  } catch (error: unknown) {
    if (isAiProviderError(error)) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('provider_timeout', {
        providerId: openAiAiProviderId,
        message: `provider request exceeded ${options.timeoutMs}ms timeout`,
        cause: error,
      });
    }

    throw new AiProviderError('provider_http_error', {
      providerId: openAiAiProviderId,
      message: 'provider request failed before structured response was produced',
      cause: error,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

export const createOpenAiAiProvider = ({
  apiKey,
  model = defaultOpenAiModel,
  baseUrl = defaultOpenAiBaseUrl,
  timeoutMs = defaultTimeoutMs,
  fetchImpl = fetch,
}: CreateOpenAiAiProviderOptions): AiProvider => ({
  providerId: openAiAiProviderId,

  async extractResume(payload: ResumeExtractionRequest) {
    return invokeStructuredOutput({
      apiKey,
      model,
      baseUrl: normalizeBaseUrl(baseUrl),
      timeoutMs,
      fetchImpl,
      schemaName: 'resume_extraction_v1',
      jsonSchema: extractedResumeJsonSchema,
      validator: extractedResumeSchema,
      systemPrompt:
        'Extract structured resume attributes. Only use evidence explicitly present in the provided text. Use null when unknown. Keep values concise and normalized.',
      userPrompt: [
        'Extract resume fields from the text below.',
        payload.sourceFilename
          ? `Source filename: ${payload.sourceFilename}`
          : 'Source filename: unknown',
        'Resume text:',
        payload.rawText,
      ].join('\n\n'),
    });
  },

  async extractJob(payload: JobExtractionRequest) {
    return invokeStructuredOutput({
      apiKey,
      model,
      baseUrl: normalizeBaseUrl(baseUrl),
      timeoutMs,
      fetchImpl,
      schemaName: 'job_extraction_v1',
      jsonSchema: extractedJobJsonSchema,
      validator: extractedJobSchema,
      systemPrompt:
        'Extract structured job posting attributes. Only use evidence explicitly present in the provided text. Use null when unknown. Keep normalized, concise values.',
      userPrompt: [
        'Extract job fields from the text below.',
        payload.sourceName ? `Source name: ${payload.sourceName}` : 'Source name: unknown',
        payload.sourceJobId
          ? `Source job id: ${payload.sourceJobId}`
          : 'Source job id: unknown',
        'Job text:',
        payload.rawText,
      ].join('\n\n'),
    });
  },

  async explainMatch(payload: MatchExplanationRequest) {
    return invokeStructuredOutput({
      apiKey,
      model,
      baseUrl: normalizeBaseUrl(baseUrl),
      timeoutMs,
      fetchImpl,
      schemaName: 'match_explanation_v1',
      jsonSchema: matchExplanationJsonSchema,
      validator: matchExplanationSchema,
      systemPrompt:
        'Generate a concise match explanation using only provided evidence. Do not invent facts. Do not claim requirements or user attributes that are not in the payload. Recommendation must be one of apply, review, skip.',
      userPrompt: JSON.stringify(
        {
          canonicalJobId: payload.canonicalJobId,
          scoreBreakdown: payload.scoreBreakdown,
          strengths: payload.strengths,
          gaps: payload.gaps,
          dealBreakers: payload.dealBreakers,
        },
        null,
        2,
      ),
    });
  },
});