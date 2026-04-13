import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ApplicationRecord,
  MatchScoreArtifact,
  ReminderTask,
} from '@job-hunter/shared';

import { resolveFeedNextAction } from '../../src/modules/tracker/next-action.js';

const baseArtifact = (
  recommendation: MatchScoreArtifact['recommendation'],
): MatchScoreArtifact => ({
  userId: '8fe4e3a8-5df4-46f6-b8c4-9ef6d627d048',
  canonicalJobId: '5ef3d330-b6de-45be-aae7-7b8fd4cc84c0',
  artifactVersion: 1,
  scoringVersion: 'deterministic-v1',
  scoreBreakdown: {
    overallScore: 80,
    titleScore: 80,
    skillScore: 80,
    seniorityScore: 80,
    locationScore: 80,
    compensationScore: 80,
    domainScore: 80,
    requirementScore: 80,
    trajectoryScore: 80,
    penaltyScore: 0,
  },
  strengths: ['strong role alignment'],
  gaps: [],
  dealBreakers: [],
  recommendation,
  explanation: {
    summary: 'Deterministic test explanation.',
    strengths: ['strong role alignment'],
    gaps: [],
    dealBreakers: [],
    recommendation,
  },
  explanationMetadata: {
    schemaVersion: 'v1',
    extractorVersion: 'deterministic-v1',
    modelVersion: 'deterministic',
    generatedAt: '2026-04-13T12:00:00.000Z',
  },
  explanationErrorCode: null,
  scoredAt: '2026-04-13T12:00:00.000Z',
});

const baseApplication = (
  status: ApplicationRecord['status'],
): ApplicationRecord => ({
  applicationId: '06b83593-96bf-4576-bd85-ce858d53467f',
  userId: '8fe4e3a8-5df4-46f6-b8c4-9ef6d627d048',
  canonicalJobId: '5ef3d330-b6de-45be-aae7-7b8fd4cc84c0',
  status,
  appliedAt: status === 'ready_to_apply' ? null : '2026-04-13T12:00:00.000Z',
  applicationUrl: null,
  resumeIdUsed: null,
  coverLetterDocUri: null,
  notes: null,
  createdAt: '2026-04-13T12:00:00.000Z',
  updatedAt: '2026-04-13T12:00:00.000Z',
});

const pendingReminder: ReminderTask = {
  reminderId: 'f9ad16cf-eb4a-4fe5-adf8-373cbf948e5a',
  userId: '8fe4e3a8-5df4-46f6-b8c4-9ef6d627d048',
  canonicalJobId: '5ef3d330-b6de-45be-aae7-7b8fd4cc84c0',
  taskType: 'application_follow_up',
  title: 'Send seven-day follow up',
  note: null,
  dueAt: '2026-04-20T12:00:00.000Z',
  status: 'pending',
  linkedTrackerEventId: null,
  createdAt: '2026-04-13T12:00:00.000Z',
  updatedAt: '2026-04-13T12:00:00.000Z',
  completedAt: null,
};

test('ready_to_apply application recommends submit_application', () => {
  const result = resolveFeedNextAction({
    trackerState: 'ready_to_apply',
    application: baseApplication('ready_to_apply'),
    pendingReminder: null,
    latestScoreArtifact: baseArtifact('apply'),
  });

  assert.equal(result.action, 'submit_application');
  assert.match(result.title, /Submit application materials/);
});

test('applied workflow with pending reminder recommends follow_up', () => {
  const result = resolveFeedNextAction({
    trackerState: 'applied',
    application: baseApplication('applied'),
    pendingReminder,
    latestScoreArtifact: baseArtifact('apply'),
  });

  assert.equal(result.action, 'follow_up');
  assert.match(result.rationale, /Pending reminder:/);
});

test('skip recommendation with no workflow recommends archive', () => {
  const result = resolveFeedNextAction({
    trackerState: null,
    application: null,
    pendingReminder: null,
    latestScoreArtifact: baseArtifact('skip'),
  });

  assert.equal(result.action, 'archive');
});

test('untracked role defaults to shortlist action', () => {
  const result = resolveFeedNextAction({
    trackerState: null,
    application: null,
    pendingReminder: null,
    latestScoreArtifact: null,
  });

  assert.equal(result.action, 'shortlist');
});
