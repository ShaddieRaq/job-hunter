export const appStates = {
  discovered: 'discovered',
  shortlisted: 'shortlisted',
  reviewing: 'reviewing',
  ready_to_apply: 'ready_to_apply',
  applied: 'applied',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  archived: 'archived',
} as const;

export type AppState = (typeof appStates)[keyof typeof appStates];
