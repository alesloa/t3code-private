import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const skillsQueryKeys = {
  all: ["skills"] as const,
  list: () => ["skills", "list"] as const,
  detail: (dirName: string) => ["skills", "detail", dirName] as const,
};

export function skillsListQueryOptions() {
  return queryOptions({
    queryKey: skillsQueryKeys.list(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.skills.list({});
    },
  });
}

export function skillDetailQueryOptions(dirName: string) {
  return queryOptions({
    queryKey: skillsQueryKeys.detail(dirName),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.skills.get({ dirName });
    },
    enabled: dirName.length > 0,
  });
}
