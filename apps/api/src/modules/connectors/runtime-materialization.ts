import { sourceNameSchema, type SourceName } from '@job-hunter/shared';

import type { AtsTargetRegistryService } from '../ats-target-registry/service.js';
import { createArbeitnowJobBoardConnector } from './arbeitnow-job-board-connector.js';
import { createGreenhousePublicBoardConnectors } from './greenhouse-board-connectors.js';
import { createGreenhousePublicBoardConnector } from './greenhouse-public-board-connector.js';
import type { ConnectorRepository } from './repository.js';
import { createConnectorService, type ConnectorService } from './service.js';
import { createLeverPublicBoardConnectors } from './lever-board-connectors.js';
import { createLeverPublicBoardConnector } from './lever-public-board-connector.js';
import type { SourceConnectorDefinition } from './types.js';

export const connectorRuntimeModes = ['legacy', 'verified_registry'] as const;

export type ConnectorRuntimeMode = (typeof connectorRuntimeModes)[number];

const defaultRuntimeMode: ConnectorRuntimeMode = 'legacy';

const maxVerifiedTargetScan = 10_000;
const verifiedTargetPageSize = 500;

const toSlug = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized.length === 0) {
    return 'target';
  }

  return normalized.slice(0, 40);
};

const toConnectorSourceName = (options: {
  prefix: string;
  identifierValue: string;
  seenSourceNames: Set<string>;
}): SourceName => {
  const slug = toSlug(options.identifierValue);
  const base = `${options.prefix}_${slug}`;

  let candidate = base;
  let duplicateIndex = 2;

  while (options.seenSourceNames.has(candidate)) {
    const suffix = `_${duplicateIndex}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    duplicateIndex += 1;
  }

  options.seenSourceNames.add(candidate);
  return sourceNameSchema.parse(candidate);
};

const parseRuntimeMode = (rawValue?: string): ConnectorRuntimeMode => {
  const normalized = (rawValue ?? defaultRuntimeMode).trim().toLowerCase();
  if ((connectorRuntimeModes as readonly string[]).includes(normalized)) {
    return normalized as ConnectorRuntimeMode;
  }

  throw new Error(
    `CONNECTOR_TARGET_MATERIALIZATION_MODE must be one of: ${connectorRuntimeModes.join(', ')}`,
  );
};

const listAllVerifiedTargets = async (
  atsTargetRegistryService: AtsTargetRegistryService,
) => {
  const aggregated = [] as Awaited<
    ReturnType<AtsTargetRegistryService['listAtsTargets']>
  >;

  let offset = 0;
  while (offset < maxVerifiedTargetScan) {
    const page = await atsTargetRegistryService.listAtsTargets({
      verificationStatus: 'verified',
      limit: verifiedTargetPageSize,
      offset,
    });

    aggregated.push(...page);

    if (page.length < verifiedTargetPageSize) {
      break;
    }

    offset += page.length;
  }

  return aggregated;
};

const buildRegistryAtsConnectors = async (
  atsTargetRegistryService: AtsTargetRegistryService,
): Promise<SourceConnectorDefinition[]> => {
  const verifiedTargets = await listAllVerifiedTargets(atsTargetRegistryService);
  const seenSourceNames = new Set<string>();

  const sortedTargets = [...verifiedTargets].sort((left, right) => {
    if (left.atsVendor !== right.atsVendor) {
      return left.atsVendor.localeCompare(right.atsVendor);
    }

    if (left.identifierValue !== right.identifierValue) {
      return left.identifierValue.localeCompare(right.identifierValue);
    }

    return left.targetId.localeCompare(right.targetId);
  });

  const connectors: SourceConnectorDefinition[] = [];

  for (const target of sortedTargets) {
    const identifierValue = target.identifierValue.trim();
    if (identifierValue.length === 0) {
      continue;
    }

    if (
      target.atsVendor === 'greenhouse' &&
      (target.identifierType === 'board_token' || target.identifierType === 'slug')
    ) {
      connectors.push(
        createGreenhousePublicBoardConnector({
          boardToken: identifierValue,
          sourceName: toConnectorSourceName({
            prefix: 'greenhouse_public_board_verified',
            identifierValue,
            seenSourceNames,
          }),
          displayName: `Greenhouse Public Board (${target.company.canonicalName})`,
        }),
      );
      continue;
    }

    if (target.atsVendor === 'lever' && target.identifierType === 'handle') {
      connectors.push(
        createLeverPublicBoardConnector({
          companyHandle: identifierValue,
          sourceName: toConnectorSourceName({
            prefix: 'lever_public_board_verified',
            identifierValue,
            seenSourceNames,
          }),
          displayName: `Lever Public Board (${target.company.canonicalName})`,
        }),
      );
    }
  }

  return connectors;
};

export interface ResolveRuntimeConnectorDefinitionsOptions {
  runtimeModeEnv?: string;
  atsTargetRegistryService: AtsTargetRegistryService;
  greenhouseBoardTokenEnv?: string;
  greenhouseBoardTokensEnv?: string;
  leverCompanyHandleEnv?: string;
  leverCompanyHandlesEnv?: string;
  arbeitnowEndpointBaseUrl?: string;
}

export const resolveRuntimeConnectorDefinitions = async ({
  runtimeModeEnv,
  atsTargetRegistryService,
  greenhouseBoardTokenEnv,
  greenhouseBoardTokensEnv,
  leverCompanyHandleEnv,
  leverCompanyHandlesEnv,
  arbeitnowEndpointBaseUrl,
}: ResolveRuntimeConnectorDefinitionsOptions): Promise<SourceConnectorDefinition[]> => {
  const runtimeMode = parseRuntimeMode(runtimeModeEnv);

  const nonAtsConnectors: SourceConnectorDefinition[] = [
    createArbeitnowJobBoardConnector({
      sourceName: 'arbeitnow_job_board',
      displayName: 'Arbeitnow Job Board',
      endpointBaseUrl:
        arbeitnowEndpointBaseUrl ?? 'https://www.arbeitnow.com/api/job-board-api',
    }),
  ];

  if (runtimeMode === 'legacy') {
    return [
      ...createGreenhousePublicBoardConnectors({
        boardTokenEnv: greenhouseBoardTokenEnv,
        boardTokensEnv: greenhouseBoardTokensEnv,
      }),
      ...createLeverPublicBoardConnectors({
        companyHandleEnv: leverCompanyHandleEnv,
        companyHandlesEnv: leverCompanyHandlesEnv,
      }),
      ...nonAtsConnectors,
    ];
  }

  const registryAtsConnectors = await buildRegistryAtsConnectors(atsTargetRegistryService);
  return [...registryAtsConnectors, ...nonAtsConnectors];
};

export interface CreateRuntimeAwareConnectorServiceOptions {
  repository: ConnectorRepository;
  atsTargetRegistryService: AtsTargetRegistryService;
  runtimeModeEnv?: string;
  greenhouseBoardTokenEnv?: string;
  greenhouseBoardTokensEnv?: string;
  leverCompanyHandleEnv?: string;
  leverCompanyHandlesEnv?: string;
  arbeitnowEndpointBaseUrl?: string;
  now?: () => Date;
}

export const createRuntimeAwareConnectorService = ({
  repository,
  atsTargetRegistryService,
  runtimeModeEnv,
  greenhouseBoardTokenEnv,
  greenhouseBoardTokensEnv,
  leverCompanyHandleEnv,
  leverCompanyHandlesEnv,
  arbeitnowEndpointBaseUrl,
  now = () => new Date(),
}: CreateRuntimeAwareConnectorServiceOptions): ConnectorService => {
  const runtimeMode = parseRuntimeMode(runtimeModeEnv);

  const buildDelegate = async (): Promise<ConnectorService> => {
    const connectors = await resolveRuntimeConnectorDefinitions({
      runtimeModeEnv: runtimeMode,
      atsTargetRegistryService,
      greenhouseBoardTokenEnv,
      greenhouseBoardTokensEnv,
      leverCompanyHandleEnv,
      leverCompanyHandlesEnv,
      arbeitnowEndpointBaseUrl,
    });

    return createConnectorService({
      repository,
      connectors,
      now,
    });
  };

  return {
    async listConnectors() {
      const delegate = await buildDelegate();
      return delegate.listConnectors();
    },

    async syncConnector(sourceName, request) {
      const delegate = await buildDelegate();
      return delegate.syncConnector(sourceName, request);
    },

    async getSourceJob(sourceName, sourceJobId) {
      const delegate = await buildDelegate();
      return delegate.getSourceJob(sourceName, sourceJobId);
    },

    async getSourceJobDetail(sourceName, sourceJobId) {
      const delegate = await buildDelegate();
      return delegate.getSourceJobDetail(sourceName, sourceJobId);
    },

    async listSourceJobs(options) {
      const delegate = await buildDelegate();
      return delegate.listSourceJobs(options);
    },
  };
};