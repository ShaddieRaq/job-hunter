import type {
  ExtractedJob,
  ExtractedResume,
  JobExtractionRequest,
  MatchExplanation,
  MatchExplanationRequest,
  ResumeExtractionRequest,
} from '@job-hunter/shared';

export type AiProviderFailureCode =
  | 'invalid_json_schema'
  | 'provider_timeout'
  | 'provider_refusal'
  | 'provider_http_error';

export interface AiProviderResult<TOutput> {
  output: TOutput;
  extractorVersion: string;
  modelVersion: string;
}

export interface AiProvider {
  readonly providerId: string;

  extractResume(
    payload: ResumeExtractionRequest,
  ): Promise<AiProviderResult<ExtractedResume>>;

  extractJob(
    payload: JobExtractionRequest,
  ): Promise<AiProviderResult<ExtractedJob>>;

  explainMatch(
    payload: MatchExplanationRequest,
  ): Promise<AiProviderResult<MatchExplanation>>;
}