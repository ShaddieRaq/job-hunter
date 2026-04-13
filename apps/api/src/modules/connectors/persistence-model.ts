export interface SourceConnectorRow {
  source_name: string;
  display_name: string;
  connector_version: string;
  health_status: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  last_sync_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_code: string | null;
}

export interface SourceJobRow {
  source_name: string;
  source_job_id: string;
  source_company_id: string | null;
  source_status: 'open' | 'closed' | 'unknown';
  title: string;
  company_name: string;
  fetch_url: string;
  application_url: string | null;
  location_text: string | null;
  remote_type: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employment_type:
    | 'full_time'
    | 'part_time'
    | 'contract'
    | 'internship'
    | 'temporary'
    | 'unknown';
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  fetched_at: string;
  checksum_sha256: string;
  description_text: string;
  normalized_skills: string[];
  required_skills: string[];
  preferred_skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: 'hour' | 'month' | 'year' | null;
  raw_payload_json: unknown;
}
