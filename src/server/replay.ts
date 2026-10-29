import type { Event } from "../shared/domain";

/** Only actions proven to have been rejected before execution may be omitted. */
export function replaySequence(events: Event[]) {
  const omitted = events.filter((e) => e.error && e.execution === "rejected");
  return {
    events: events.filter((e) => !omitted.includes(e)),
    omitted,
  };
}
