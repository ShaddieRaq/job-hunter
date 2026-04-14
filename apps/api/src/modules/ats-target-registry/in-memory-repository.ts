import type {
  AtsTargetVerificationEvent,
  AtsTargetVerificationEventRepository,
  AtsVendor,
} from './repository.js';

interface InMemoryAtsTargetVerificationEventRepositoryOptions {
  resolveVendorByTargetId?: (targetId: string) => AtsVendor | null;
}

const cloneVerificationEvent = (
  event: AtsTargetVerificationEvent,
): AtsTargetVerificationEvent => ({
  ...event,
});

export const createInMemoryAtsTargetVerificationEventRepository = (
  options: InMemoryAtsTargetVerificationEventRepositoryOptions = {},
): AtsTargetVerificationEventRepository => {
  const eventsById = new Map<string, AtsTargetVerificationEvent>();

  return {
    async createVerificationEvent(event) {
      if (eventsById.has(event.eventId)) {
        throw new Error('verification_event_insert_failed_duplicate_event_id');
      }

      eventsById.set(event.eventId, cloneVerificationEvent(event));
      return cloneVerificationEvent(event);
    },

    async listVerificationEvents({ targetId, atsVendor, limit, offset }) {
      const normalizedLimit = Math.max(0, limit);
      const normalizedOffset = Math.max(0, offset);

      return [...eventsById.values()]
        .filter((event) => (targetId ? event.targetId === targetId : true))
        .filter((event) => {
          if (!atsVendor) {
            return true;
          }

          const resolvedVendor = options.resolveVendorByTargetId?.(event.targetId);
          return resolvedVendor === atsVendor;
        })
        .sort((left, right) => {
          if (left.attemptedAt !== right.attemptedAt) {
            return right.attemptedAt.localeCompare(left.attemptedAt);
          }

          return right.eventId.localeCompare(left.eventId);
        })
        .slice(normalizedOffset, normalizedOffset + normalizedLimit)
        .map(cloneVerificationEvent);
    },
  };
};