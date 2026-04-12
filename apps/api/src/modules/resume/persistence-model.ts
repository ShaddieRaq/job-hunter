export interface ResumeRow {
  resume_id: string;
  user_id: string;
  file_uri: string;
  original_filename: string;
  content_type:
    | 'text/plain'
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  size_bytes: number;
  checksum_sha256: string;
  parser_version: string;
  parse_status: 'parsed' | 'unsupported_format' | 'failed';
  parsed_text: string | null;
  uploaded_at: string;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeStructuredProfileRow {
  resume_id: string;
  normalized_skills: string[];
  experience_roles: string[];
  companies: string[];
  industries: string[];
  education: string[];
  certifications: string[];
  inferred_seniority:
    | 'intern'
    | 'junior'
    | 'mid'
    | 'senior'
    | 'staff'
    | 'principal'
    | null;
  extraction_confidence: number;
  extracted_at: string;
}