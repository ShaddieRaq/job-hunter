import assert from 'node:assert/strict';
import test from 'node:test';

import type { UserPreferences } from '@job-hunter/shared';

import { buildDeterministicMatchScore } from '../../src/modules/ai/scoring.js';

const createPreferences = (): UserPreferences => {
  const nowIso = new Date().toISOString();

  return {
    userId: '019d633e-f28b-7db8-8565-6e4d9f9e0e73',
    preferredTitles: ['Backend Engineer'],
    preferredIndustries: ['fintech'],
    preferredSkills: ['TypeScript', 'Node.js'],
    preferredLocations: ['United States'],
    remotePreference: 'remote',
    targetSeniorityMin: 'mid',
    targetSeniorityMax: 'senior',
    salaryMin: 150000,
    salaryTarget: 180000,
    dealBreakers: ['onsite'],
    hiddenCompanies: [],
    hiddenTitles: [],
    stretchPreferenceLevel: 3,
    notificationPreferences: {
      dailyDigest: true,
      weeklyDigest: true,
      instantHighFit: true,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

test('buildDeterministicMatchScore returns apply for strong profile alignment', () => {
  const result = buildDeterministicMatchScore({
    preferences: createPreferences(),
    resumeExtraction: {
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS'],
      domains: ['fintech'],
      experienceRoles: ['Senior Backend Engineer'],
      yearsExperience: { minimum: 7, maximum: null },
      inferredSeniority: 'senior',
      preferredLocations: ['United States'],
      remotePreference: 'remote',
      sponsorshipRequired: false,
      workAuthorization: 'United States',
    },
    jobExtraction: {
      normalizedTitle: 'Senior Backend Engineer',
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS', 'Docker'],
      requiredSkills: ['TypeScript', 'Node.js', 'AWS'],
      preferredSkills: ['Docker'],
      requiredYearsExperience: { minimum: 5, maximum: null },
      domainTags: ['fintech'],
      seniority: 'senior',
      locationConstraint: 'United States',
      remoteType: 'remote',
      sponsorshipAvailable: true,
      salaryMin: 160000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    },
  });

  assert.equal(result.recommendation, 'apply');
  assert.equal(result.dealBreakers.length, 0);
  assert.ok(result.scoreBreakdown.overallScore >= 75);
});

test('buildDeterministicMatchScore returns skip on remote-vs-onsite conflict', () => {
  const result = buildDeterministicMatchScore({
    preferences: createPreferences(),
    resumeExtraction: {
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS'],
      domains: ['fintech'],
      experienceRoles: ['Backend Engineer'],
      yearsExperience: { minimum: 6, maximum: null },
      inferredSeniority: 'senior',
      preferredLocations: ['United States'],
      remotePreference: 'remote',
      sponsorshipRequired: false,
      workAuthorization: 'United States',
    },
    jobExtraction: {
      normalizedTitle: 'Senior Backend Engineer',
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS'],
      requiredSkills: ['TypeScript', 'Node.js'],
      preferredSkills: ['AWS'],
      requiredYearsExperience: { minimum: 5, maximum: null },
      domainTags: ['fintech'],
      seniority: 'senior',
      locationConstraint: 'New York, United States',
      remoteType: 'onsite',
      sponsorshipAvailable: true,
      salaryMin: 160000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    },
  });

  assert.equal(result.recommendation, 'skip');
  assert.ok(
    result.dealBreakers.some((reason) =>
      reason.toLowerCase().includes('remote-only preference'),
    ),
  );
});

test('buildDeterministicMatchScore adds requirement deal breaker for low required-skill coverage', () => {
  const result = buildDeterministicMatchScore({
    preferences: createPreferences(),
    resumeExtraction: {
      normalizedSkills: ['TypeScript'],
      domains: ['fintech'],
      experienceRoles: ['Backend Engineer'],
      yearsExperience: { minimum: 3, maximum: null },
      inferredSeniority: 'mid',
      preferredLocations: ['United States'],
      remotePreference: 'remote',
      sponsorshipRequired: false,
      workAuthorization: 'United States',
    },
    jobExtraction: {
      normalizedTitle: 'Senior Backend Engineer',
      normalizedSkills: ['TypeScript', 'Node.js', 'AWS', 'Kubernetes'],
      requiredSkills: ['TypeScript', 'Node.js', 'AWS', 'Kubernetes'],
      preferredSkills: ['Docker'],
      requiredYearsExperience: { minimum: 7, maximum: null },
      domainTags: ['fintech'],
      seniority: 'senior',
      locationConstraint: 'United States',
      remoteType: 'remote',
      sponsorshipAvailable: true,
      salaryMin: 170000,
      salaryMax: 220000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    },
  });

  assert.ok(result.scoreBreakdown.requirementScore < 60);
  assert.ok(
    result.dealBreakers.some((reason) =>
      reason.toLowerCase().includes('majority of required job skills'),
    ),
  );
});