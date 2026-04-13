export interface CanonicalJobRow {
  canonical_job_id: string;
  canonical_company_name: string;
  canonical_title: string;
  normalized_location: string | null;
  remote_type: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employment_type:
    | 'full_time'
    | 'part_time'
    | 'contract'
    | 'internship'
    | 'temporary'
    | 'unknown';
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: 'hour' | 'month' | 'year' | null;
  source_count: number;
  source_names: string[];
  job_status: 'open' | 'closed' | 'unknown';
  top_skills: string[];
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface CanonicalSourceMappingRow {
  source_name: string;
  source_job_id: string;
  is_primary: boolean;
  mapping_confidence: number | string;
  mapping_reason_codes: Array<
    'exact_company_title' | 'strong_title_overlap' | 'same_remote_type' | 'same_location_token' | 'same_salary_band'
  >;
}
