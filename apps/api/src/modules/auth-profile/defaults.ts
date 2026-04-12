import type {
  UserPreferencesPayload,
  UserProfilePayload,
} from '@job-hunter/shared';

export const createDefaultProfilePayload = (): UserProfilePayload => ({
  currentTitle: null,
  yearsExperience: null,
  summary: null,
  workAuthorization: null,
  sponsorshipRequired: null,
  transitionNotes: null,
});

export const createDefaultPreferencesPayload = (): UserPreferencesPayload => ({
  preferredTitles: [],
  preferredIndustries: [],
  preferredSkills: [],
  preferredLocations: [],
  remotePreference: 'flexible',
  targetSeniorityMin: null,
  targetSeniorityMax: null,
  salaryMin: null,
  salaryTarget: null,
  dealBreakers: [],
  hiddenCompanies: [],
  hiddenTitles: [],
  stretchPreferenceLevel: 3,
  notificationPreferences: {
    dailyDigest: true,
    weeklyDigest: false,
    instantHighFit: true,
  },
});
