import type { ChannelSearchFilters } from "./types";

export function activeChannelSearchFilterCount(filters: ChannelSearchFilters) {
  return (
    filters.senderUids.length +
    (filters.sort !== "time_desc" ? 1 : 0) +
    (filters.datePreset || filters.startAt || filters.endAt ? 1 : 0)
  );
}
