import type { ThreadId } from "@t3tools/contracts";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { CloudUploadIcon, GitCommitIcon, InfoIcon } from "lucide-react";
import { GitHubIcon } from "./Icons";
import { type GitQuickAction, resolveQuickAction } from "./GitActionsControl.logic";
import { Button } from "~/components/ui/button";
import { useGitPanelStore } from "~/gitPanelStore";
import {
  gitBranchesQueryOptions,
  gitInitMutationOptions,
  gitMutationKeys,
  gitStatusQueryOptions,
} from "~/lib/gitReactQuery";

interface GitActionsControlProps {
  gitCwd: string | null;
  activeThreadId: ThreadId | null;
}

function GitQuickActionIcon({ quickAction }: { quickAction: GitQuickAction }) {
  const iconClassName = "size-3.5";
  if (quickAction.kind === "open_pr") return <GitHubIcon className={iconClassName} />;
  if (quickAction.kind === "run_pull") return <InfoIcon className={iconClassName} />;
  if (quickAction.kind === "run_action") {
    if (quickAction.action === "commit") return <GitCommitIcon className={iconClassName} />;
    if (quickAction.action === "commit_push") return <CloudUploadIcon className={iconClassName} />;
    return <GitHubIcon className={iconClassName} />;
  }
  if (quickAction.label === "Commit") return <GitCommitIcon className={iconClassName} />;
  return <InfoIcon className={iconClassName} />;
}

export default function GitActionsControl({ gitCwd, activeThreadId }: GitActionsControlProps) {
  const queryClient = useQueryClient();
  const openGitPanel = useGitPanelStore((s) => s.openPanel);

  const { data: gitStatus = null } = useQuery(gitStatusQueryOptions(gitCwd));
  const { data: branchList = null } = useQuery(gitBranchesQueryOptions(gitCwd));

  const isRepo = branchList?.isRepo ?? true;
  const hasOriginRemote = branchList?.hasOriginRemote ?? false;

  const gitStatusForActions = useMemo(() => {
    const currentBranch = branchList?.branches.find((b) => b.current)?.name ?? null;
    const isOutOfSync =
      !!gitStatus?.branch && !!currentBranch && gitStatus.branch !== currentBranch;
    return isOutOfSync ? null : gitStatus;
  }, [branchList, gitStatus]);

  const isDefaultBranch = useMemo(() => {
    const branchName = gitStatusForActions?.branch;
    if (!branchName) return false;
    const current = branchList?.branches.find((b) => b.name === branchName);
    return current?.isDefault ?? (branchName === "main" || branchName === "master");
  }, [branchList?.branches, gitStatusForActions?.branch]);

  const isRunStackedActionRunning =
    useIsMutating({ mutationKey: gitMutationKeys.runStackedAction(gitCwd) }) > 0;
  const isPullRunning = useIsMutating({ mutationKey: gitMutationKeys.pull(gitCwd) }) > 0;
  const isGitActionRunning = isRunStackedActionRunning || isPullRunning;

  const initMutation = useMutation(gitInitMutationOptions({ cwd: gitCwd, queryClient }));

  const quickAction = useMemo(
    () =>
      resolveQuickAction(gitStatusForActions, isGitActionRunning, isDefaultBranch, hasOriginRemote),
    [gitStatusForActions, hasOriginRemote, isDefaultBranch, isGitActionRunning],
  );

  if (!gitCwd) return null;

  if (!isRepo) {
    return (
      <Button
        variant="outline"
        size="xs"
        disabled={initMutation.isPending}
        onClick={() => initMutation.mutate()}
      >
        {initMutation.isPending ? "Initializing..." : "Initialize Git"}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="xs"
      className="shrink-0"
      disabled={isGitActionRunning}
      onClick={() => {
        if (activeThreadId) {
          openGitPanel(activeThreadId, "changes");
        }
      }}
    >
      <GitQuickActionIcon quickAction={quickAction} />
      <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
        {quickAction.label}
      </span>
    </Button>
  );
}
