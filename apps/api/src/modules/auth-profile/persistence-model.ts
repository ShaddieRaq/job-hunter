export interface UserRow {
  user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface UserSessionRow {
  access_token: string;
  user_id: string;
  created_at: string;
}

export interface UserProfileRow {
  user_id: string;
  current_title: string | null;
  years_experience: number | null;
  summary: string | null;
  work_authorization: 'citizen' | 'permanent_resident' | 'visa' | 'other' | null;
  sponsorship_required: boolean | null;
  transition_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow {
  user_id: string;
  preferred_titles: string[];
  preferred_industries: string[];
  preferred_skills: string[];
  preferred_locations: string[];
  remote_preference: 'remote' | 'hybrid' | 'onsite' | 'flexible';
  target_seniority_min:
    | 'intern'
    | 'junior'
    | 'mid'
    | 'senior'
    | 'staff'
    | 'principal'
    | null;
  target_seniority_max:
    | 'intern'
    | 'junior'
    | 'mid'
    | 'senior'
    | 'staff'
    | 'principal'
    | null;
  salary_min: number | null;
  salary_target: number | null;
  deal_breakers: string[];
  hidden_companies: string[];
  hidden_titles: string[];
  stretch_preference_level: number;
  notification_preferences: {
    dailyDigest: boolean;
    weeklyDigest: boolean;
    instantHighFit: boolean;
  };
  created_at: string;
  updated_at: string;
}
