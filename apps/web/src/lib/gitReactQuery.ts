import { type GitStackedAction } from "@t3tools/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

const GIT_STATUS_STALE_TIME_MS = 5_000;
const GIT_STATUS_REFETCH_INTERVAL_MS = 15_000;
const GIT_STATUS_DETAILED_STALE_TIME_MS = 3_000;
const GIT_STATUS_DETAILED_REFETCH_INTERVAL_MS = 10_000;
const GIT_BRANCHES_STALE_TIME_MS = 15_000;
const GIT_BRANCHES_REFETCH_INTERVAL_MS = 60_000;

export const gitQueryKeys = {
  all: ["git"] as const,
  status: (cwd: string | null) => ["git", "status", cwd] as const,
  statusDetailed: (cwd: string | null) => ["git", "statusDetailed", cwd] as const,
  branches: (cwd: string | null) => ["git", "branches", cwd] as const,
  stashList: (cwd: string | null) => ["git", "stashList", cwd] as const,
  stashShow: (cwd: string | null, index: number) => ["git", "stashShow", cwd, index] as const,
  stashShowFiles: (cwd: string | null, index: number) =>
    ["git", "stashShowFiles", cwd, index] as const,
  stashShowFile: (cwd: string | null, index: number, filePath: string) =>
    ["git", "stashShowFile", cwd, index, filePath] as const,
  worktrees: (cwd: string | null) => ["git", "worktrees", cwd] as const,
  pullRequests: (cwd: string | null, state: string) => ["git", "pullRequests", cwd, state] as const,
  log: (cwd: string | null, branch?: string, skip?: number) =>
    ["git", "log", cwd, branch ?? "all", skip ?? 0] as const,
};

export const gitMutationKeys = {
  init: (cwd: string | null) => ["git", "mutation", "init", cwd] as const,
  checkout: (cwd: string | null) => ["git", "mutation", "checkout", cwd] as const,
  runStackedAction: (cwd: string | null) => ["git", "mutation", "run-stacked-action", cwd] as const,
  pull: (cwd: string | null) => ["git", "mutation", "pull", cwd] as const,
  stageFiles: (cwd: string | null) => ["git", "mutation", "stage-files", cwd] as const,
  unstageFiles: (cwd: string | null) => ["git", "mutation", "unstage-files", cwd] as const,
  discardChanges: (cwd: string | null) => ["git", "mutation", "discard-changes", cwd] as const,
  deleteBranch: (cwd: string | null) => ["git", "mutation", "delete-branch", cwd] as const,
  preparePullRequestThread: (cwd: string | null) =>
    ["git", "mutation", "prepare-pull-request-thread", cwd] as const,
  stashCreate: (cwd: string | null) => ["git", "mutation", "stash-create", cwd] as const,
  stashApply: (cwd: string | null) => ["git", "mutation", "stash-apply", cwd] as const,
  stashPop: (cwd: string | null) => ["git", "mutation", "stash-pop", cwd] as const,
  stashDrop: (cwd: string | null) => ["git", "mutation", "stash-drop", cwd] as const,
  stashRestoreFile: (cwd: string | null) => ["git", "mutation", "stash-restore-file", cwd] as const,
  softReset: (cwd: string | null) => ["git", "mutation", "soft-reset", cwd] as const,
  revertCommit: (cwd: string | null) => ["git", "mutation", "revert-commit", cwd] as const,
  generateCommitMessage: (cwd: string | null) =>
    ["git", "mutation", "generate-commit-message", cwd] as const,
};

export function invalidateGitQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: gitQueryKeys.all });
}

export function gitStatusQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.status(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git status is unavailable.");
      return api.git.status({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_STATUS_STALE_TIME_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: GIT_STATUS_REFETCH_INTERVAL_MS,
  });
}

export function gitBranchesQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.branches(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git branches are unavailable.");
      return api.git.listBranches({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_BRANCHES_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: GIT_BRANCHES_REFETCH_INTERVAL_MS,
  });
}

export function gitResolvePullRequestQueryOptions(input: {
  cwd: string | null;
  reference: string | null;
}) {
  return queryOptions({
    queryKey: ["git", "pull-request", input.cwd, input.reference] as const,
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd || !input.reference) {
        throw new Error("Pull request lookup is unavailable.");
      }
      return api.git.resolvePullRequest({ cwd: input.cwd, reference: input.reference });
    },
    enabled: input.cwd !== null && input.reference !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function gitInitMutationOptions(input: { cwd: string | null; queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: gitMutationKeys.init(input.cwd),
    mutationFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git init is unavailable.");
      return api.git.init({ cwd: input.cwd });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitCheckoutMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.checkout(input.cwd),
    mutationFn: async (branch: string) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git checkout is unavailable.");
      return api.git.checkout({ cwd: input.cwd, branch });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitRunStackedActionMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.runStackedAction(input.cwd),
    mutationFn: async ({
      actionId,
      action,
      commitMessage,
      featureBranch,
      filePaths,
    }: {
      actionId: string;
      action: GitStackedAction;
      commitMessage?: string;
      featureBranch?: boolean;
      filePaths?: string[];
    }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git action is unavailable.");
      return api.git.runStackedAction({
        actionId,
        cwd: input.cwd,
        action,
        ...(commitMessage ? { commitMessage } : {}),
        ...(featureBranch ? { featureBranch } : {}),
        ...(filePaths ? { filePaths } : {}),
      });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitPullMutationOptions(input: { cwd: string | null; queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: gitMutationKeys.pull(input.cwd),
    mutationFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git pull is unavailable.");
      return api.git.pull({ cwd: input.cwd });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitCreateWorktreeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: async ({
      cwd,
      branch,
      newBranch,
      path,
    }: {
      cwd: string;
      branch: string;
      newBranch: string;
      path?: string | null;
    }) => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree creation is unavailable.");
      return api.git.createWorktree({ cwd, branch, newBranch, path: path ?? null });
    },
    mutationKey: ["git", "mutation", "create-worktree"] as const,
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitRemoveWorktreeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: async ({ cwd, path, force }: { cwd: string; path: string; force?: boolean }) => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree removal is unavailable.");
      return api.git.removeWorktree({ cwd, path, force });
    },
    mutationKey: ["git", "mutation", "remove-worktree"] as const,
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitPreparePullRequestThreadMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({ reference, mode }: { reference: string; mode: "local" | "worktree" }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Pull request thread preparation is unavailable.");
      return api.git.preparePullRequestThread({
        cwd: input.cwd,
        reference,
        mode,
      });
    },
    mutationKey: gitMutationKeys.preparePullRequestThread(input.cwd),
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitStatusDetailedQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.statusDetailed(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git detailed status is unavailable.");
      return api.git.statusDetailed({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_STATUS_DETAILED_STALE_TIME_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: GIT_STATUS_DETAILED_REFETCH_INTERVAL_MS,
  });
}

export function gitStageFilesMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stageFiles(input.cwd),
    mutationFn: async (filePaths: string[]) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stage is unavailable.");
      return api.git.stageFiles({ cwd: input.cwd, filePaths });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitUnstageFilesMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.unstageFiles(input.cwd),
    mutationFn: async (filePaths: string[]) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git unstage is unavailable.");
      return api.git.unstageFiles({ cwd: input.cwd, filePaths });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitDiscardChangesMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.discardChanges(input.cwd),
    mutationFn: async (filePaths: string[]) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git discard is unavailable.");
      return api.git.discardChanges({ cwd: input.cwd, filePaths });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitDeleteBranchMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.deleteBranch(input.cwd),
    mutationFn: async ({ branch, force }: { branch: string; force?: boolean }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git delete branch is unavailable.");
      return api.git.deleteBranch({ cwd: input.cwd, branch, ...(force ? { force } : {}) });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

// ── Stash ────────────────────────────────────────────────────────────

const GIT_STASH_STALE_TIME_MS = 5_000;
const GIT_STASH_REFETCH_INTERVAL_MS = 30_000;

export function gitStashListQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.stashList(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git stash list is unavailable.");
      return api.git.stashList({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_STASH_STALE_TIME_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: GIT_STASH_REFETCH_INTERVAL_MS,
  });
}

export function gitStashShowQueryOptions(cwd: string | null, index: number) {
  return queryOptions({
    queryKey: gitQueryKeys.stashShow(cwd, index),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git stash show is unavailable.");
      return api.git.stashShow({ cwd, index });
    },
    enabled: cwd !== null,
    staleTime: Infinity,
  });
}

export function gitStashCreateMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stashCreate(input.cwd),
    mutationFn: async ({
      message,
      includeUntracked,
      filePaths,
    }: {
      message?: string;
      includeUntracked?: boolean;
      filePaths?: string[];
    }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stash create is unavailable.");
      return api.git.stashCreate({
        cwd: input.cwd,
        ...(message ? { message } : {}),
        ...(includeUntracked ? { includeUntracked } : {}),
        ...(filePaths && filePaths.length > 0 ? { filePaths } : {}),
      });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitStashApplyMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stashApply(input.cwd),
    mutationFn: async (index: number) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stash apply is unavailable.");
      return api.git.stashApply({ cwd: input.cwd, index });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitStashPopMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stashPop(input.cwd),
    mutationFn: async (index: number) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stash pop is unavailable.");
      return api.git.stashPop({ cwd: input.cwd, index });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitStashDropMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stashDrop(input.cwd),
    mutationFn: async (index: number) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stash drop is unavailable.");
      return api.git.stashDrop({ cwd: input.cwd, index });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

// ── Worktrees ─────────────────────────────────────────────────────────

const GIT_WORKTREES_STALE_TIME_MS = 15_000;
const GIT_WORKTREES_REFETCH_INTERVAL_MS = 60_000;

export function gitWorktreesQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.worktrees(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree list is unavailable.");
      return api.git.listWorktrees({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_WORKTREES_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: GIT_WORKTREES_REFETCH_INTERVAL_MS,
  });
}

// ── Pull Requests ─────────────────────────────────────────────────────

const GIT_PULL_REQUESTS_STALE_TIME_MS = 30_000;
const GIT_PULL_REQUESTS_REFETCH_INTERVAL_MS = 120_000;

export function gitPullRequestsQueryOptions(cwd: string | null, state: "open" | "closed" | "all") {
  return queryOptions({
    queryKey: gitQueryKeys.pullRequests(cwd, state),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git pull request list is unavailable.");
      return api.git.listPullRequests({ cwd, state });
    },
    enabled: cwd !== null,
    staleTime: GIT_PULL_REQUESTS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: GIT_PULL_REQUESTS_REFETCH_INTERVAL_MS,
  });
}

// ── Generate Commit Message ──────────────────────────────────────────

export function gitGenerateCommitMessageMutationOptions(input: { cwd: string | null }) {
  return mutationOptions({
    mutationKey: gitMutationKeys.generateCommitMessage(input.cwd),
    mutationFn: async (filePaths?: string[]) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git commit message generation is unavailable.");
      return api.git.generateCommitMessage({
        cwd: input.cwd,
        ...(filePaths && filePaths.length > 0 ? { filePaths } : {}),
      });
    },
  });
}

// ── Stash File-Level ────────────────────────────────────────────────

export function gitStashShowFilesQueryOptions(cwd: string | null, index: number) {
  return queryOptions({
    queryKey: gitQueryKeys.stashShowFiles(cwd, index),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git stash show files is unavailable.");
      return api.git.stashShowFiles({ cwd, index });
    },
    enabled: cwd !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function gitStashShowFileQueryOptions(
  cwd: string | null,
  index: number,
  filePath: string | null,
) {
  return queryOptions({
    queryKey: gitQueryKeys.stashShowFile(cwd, index, filePath ?? ""),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd || !filePath) throw new Error("Git stash show file is unavailable.");
      return api.git.stashShowFile({ cwd, index, filePath });
    },
    enabled: cwd !== null && filePath !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function gitStashRestoreFileMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.stashRestoreFile(input.cwd),
    mutationFn: async ({ index, filePath }: { index: number; filePath: string }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git stash restore file is unavailable.");
      return api.git.stashRestoreFile({ cwd: input.cwd, index, filePath });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

// ── Soft Reset / Revert ──────────────────────────────────────────────

export function gitSoftResetMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.softReset(input.cwd),
    mutationFn: async (sha: string) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git soft reset is unavailable.");
      return api.git.softReset({ cwd: input.cwd, sha });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitRevertCommitMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.revertCommit(input.cwd),
    mutationFn: async (sha: string) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git revert commit is unavailable.");
      return api.git.revertCommit({ cwd: input.cwd, sha });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

// ── Log ───────────────────────────────────────────────────────────────

export function gitLogQueryOptions(
  cwd: string | null,
  opts?: { branch?: string; skip?: number; maxCount?: number },
) {
  return queryOptions({
    queryKey: gitQueryKeys.log(cwd, opts?.branch, opts?.skip),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git log is unavailable.");
      return api.git.log({
        cwd,
        ...(opts?.branch ? { branch: opts.branch } : {}),
        ...(opts?.skip ? { skip: opts.skip } : {}),
        ...(opts?.maxCount ? { maxCount: opts.maxCount } : {}),
      });
    },
    enabled: cwd !== null,
    staleTime: 10_000,
  });
}
