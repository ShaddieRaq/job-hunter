import type {
  ApplicationRecord,
  FeedNextAction,
  MatchScoreArtifact,
  ReminderTask,
  TrackerState,
} from '@job-hunter/shared';

export interface ResolveFeedNextActionInput {
  trackerState: TrackerState | null;
  application: ApplicationRecord | null;
  pendingReminder: ReminderTask | null;
  latestScoreArtifact: MatchScoreArtifact | null;
}

const buildAction = (
  action: FeedNextAction['action'],
  title: string,
  rationale: string,
): FeedNextAction => ({
  action,
  title,
  rationale,
});

const isTerminalApplicationStatus = (
  status: ApplicationRecord['status'],
): boolean => status === 'rejected' || status === 'archived';

export const resolveFeedNextAction = ({
  trackerState,
  application,
  pendingReminder,
  latestScoreArtifact,
}: ResolveFeedNextActionInput): FeedNextAction => {
  if (application) {
    if (application.status === 'ready_to_apply') {
      return buildAction(
        'submit_application',
        'Submit application materials',
        'Application record exists and is ready to apply; finalize your tailored materials and submit externally.',
      );
    }

    if (application.status === 'applied' || application.status === 'interview') {
      if (pendingReminder) {
        return buildAction(
          'follow_up',
          'Complete follow-up reminder',
          `Pending reminder: ${pendingReminder.title}.`,
        );
      }

      return buildAction(
        'follow_up',
        'Schedule follow-up step',
        'Application is in progress; create or complete your next follow-up action.',
      );
    }

    if (application.status === 'offer') {
      return buildAction(
        'follow_up',
        'Track offer decision steps',
        'Capture final questions, negotiation points, and decision checkpoints before closing this workflow.',
      );
    }

    if (isTerminalApplicationStatus(application.status)) {
      return buildAction(
        'archive',
        'Archive and move on',
        'This application is already in a terminal state, so archive context and focus on active roles.',
      );
    }
  }

  if (trackerState === 'archived') {
    return buildAction(
      'archive',
      'Archive and move on',
      'This role is already hidden in your tracker. Keep focus on active opportunities.',
    );
  }

  if (
    trackerState === 'shortlisted' ||
    trackerState === 'reviewing' ||
    trackerState === 'ready_to_apply'
  ) {
    return buildAction(
      'create_application',
      'Create application record',
      'You already marked this role for consideration; start an application record to keep submission details auditable.',
    );
  }

  if (
    trackerState === 'applied' ||
    trackerState === 'interview' ||
    trackerState === 'offer'
  ) {
    if (pendingReminder) {
      return buildAction(
        'follow_up',
        'Complete follow-up reminder',
        `Pending reminder: ${pendingReminder.title}.`,
      );
    }

    return buildAction(
      'follow_up',
      'Schedule follow-up step',
      'Workflow state is already active beyond discovery; set the next follow-up action to keep momentum.',
    );
  }

  if (latestScoreArtifact?.recommendation === 'skip') {
    return buildAction(
      'archive',
      'Archive and move on',
      'Current match recommendation is skip; archive this role unless new evidence changes fit.',
    );
  }

  if (latestScoreArtifact?.recommendation === 'apply') {
    return buildAction(
      'shortlist',
      'Shortlist this role',
      'Recommendation is apply; shortlist now so you can prioritize material prep and submission.',
    );
  }

  if (latestScoreArtifact?.recommendation === 'review') {
    return buildAction(
      'shortlist',
      'Shortlist for focused review',
      'Recommendation is review; shortlist to keep it in your active consideration set.',
    );
  }

  return buildAction(
    'shortlist',
    'Shortlist this role',
    'No tracked workflow exists yet; shortlist first to avoid losing context while you decide.',
  );
};
