import type { ProjectListEntriesResult, ProjectSearchEntriesResult } from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
  listEntries: (cwd: string | null, parentPath: string | undefined) =>
    ["projects", "list-entries", cwd, parentPath ?? "__root__"] as const,
};

const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};
const EMPTY_LIST_ENTRIES_RESULT: ProjectListEntriesResult = {
  entries: [],
  truncated: false,
};

export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

export function projectListEntriesQueryOptions(input: {
  cwd: string | null;
  parentPath?: string;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: projectQueryKeys.listEntries(input.cwd, input.parentPath),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry listing is unavailable.");
      }
      return api.projects.listEntries({
        cwd: input.cwd,
        parentPath: input.parentPath,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_LIST_ENTRIES_RESULT,
  });
}
