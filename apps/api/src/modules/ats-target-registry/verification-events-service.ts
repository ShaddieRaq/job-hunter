import type { AtsTargetId, AtsVendor } from '@job-hunter/shared';

import { createInMemoryAtsTargetVerificationEventRepository } from './in-memory-repository.js';
import type {
  AtsTargetVerificationEvent,
  AtsTargetVerificationEventRepository,
} from './repository.js';

const defaultListLimit = 100;
const maxListLimit = 500;

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.min(Math.max(1, limit), maxListLimit);
};

const normalizeOffset = (offset: number | undefined): number => {
  if (offset === undefined) {
    return 0;
  }

  return Math.max(0, offset);
};

export interface AtsTargetVerificationEventService {
  listVerificationEvents(options: {
    targetId?: AtsTargetId;
    atsVendor?: AtsVendor;
    limit?: number;
    offset?: number;
  }): Promise<AtsTargetVerificationEvent[]>;
}

export interface CreateAtsTargetVerificationEventServiceOptions {
  repository?: AtsTargetVerificationEventRepository;
}

export const createAtsTargetVerificationEventService = ({
  repository = createInMemoryAtsTargetVerificationEventRepository(),
}: CreateAtsTargetVerificationEventServiceOptions = {}): AtsTargetVerificationEventService => ({
  async listVerificationEvents({ targetId, atsVendor, limit, offset }) {
    return repository.listVerificationEvents({
      targetId,
      atsVendor,
      limit: normalizeLimit(limit),
      offset: normalizeOffset(offset),
    });
  },
});