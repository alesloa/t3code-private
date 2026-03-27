import { type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CloudUploadIcon,
  FileIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  LoaderIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { memo, useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { useGitPanelStore } from "~/gitPanelStore";
import {
  gitGenerateCommitMessageMutationOptions,
  gitPullMutationOptions,
  gitRunStackedActionMutationOptions,
  gitStageFilesMutationOptions,
  gitStashCreateMutationOptions,
  gitStatusDetailedQueryOptions,
  gitUnstageFilesMutationOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";
import { useFileEditorStore } from "~/fileEditorStore";

function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === "added"
      ? "text-success"
      : status === "deleted"
        ? "text-destructive"
        : status === "renamed"
          ? "text-info"
          : "text-warning";
  const letter = status[0]?.toUpperCase() ?? "?";
  return <span className={`shrink-0 font-mono text-[10px] font-bold ${colorClass}`}>{letter}</span>;
}

function FileRow({
  path,
  status,
  insertions,
  deletions,
  actionIcon,
  onAction,
  onClickFile,
  checked,
  onToggle,
}: {
  path: string;
  status?: string;
  insertions?: number;
  deletions?: number;
  actionIcon: "stage" | "unstage";
  onAction: () => void;
  onClickFile: () => void;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 px-3 py-0.5 text-xs hover:bg-accent/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-3 shrink-0 accent-primary"
      />
      {status && <StatusBadge status={status} />}
      {!status && <FileIcon className="size-3 shrink-0 text-muted-foreground" />}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left font-mono"
        onClick={onClickFile}
        title={path}
      >
        {path}
      </button>
      {insertions !== undefined && deletions !== undefined && (insertions > 0 || deletions > 0) && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {insertions > 0 && <span className="text-success">+{insertions}</span>}
          {insertions > 0 && deletions > 0 && " "}
          {deletions > 0 && <span className="text-destructive">-{deletions}</span>}
        </span>
      )}
      <button
        type="button"
        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        onClick={onAction}
        aria-label={actionIcon === "stage" ? "Stage file" : "Unstage file"}
      >
        {actionIcon === "stage" ? (
          <PlusIcon className="size-3" />
        ) : (
          <MinusIcon className="size-3" />
        )}
      </button>
    </div>
  );
}

export default memo(function ChangesTab({
  gitCwd,
  threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const queryClient = useQueryClient();
  const commitMessage = useGitPanelStore((s) => s.stateByThreadId[threadId]?.commitMessage ?? "");
  const setCommitMessage = useGitPanelStore((s) => s.setCommitMessage);
  const setActiveTab = useGitPanelStore((s) => s.setActiveTab);
  const openFile = useFileEditorStore((s) => s.openFile);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);

  const {
    data: detailedStatus,
    isLoading,
    refetch,
  } = useQuery(gitStatusDetailedQueryOptions(gitCwd));

  const stageMutation = useMutation(gitStageFilesMutationOptions({ cwd: gitCwd, queryClient }));
  const unstageMutation = useMutation(gitUnstageFilesMutationOptions({ cwd: gitCwd, queryClient }));
  const commitMutation = useMutation(
    gitRunStackedActionMutationOptions({ cwd: gitCwd, queryClient }),
  );
  const stashMutation = useMutation(gitStashCreateMutationOptions({ cwd: gitCwd, queryClient }));
  const pullMutation = useMutation(gitPullMutationOptions({ cwd: gitCwd, queryClient }));
  const generateMutation = useMutation(gitGenerateCommitMessageMutationOptions({ cwd: gitCwd }));

  // Push-only: use runStackedAction with commit_push — commit step is skipped when tree is clean
  const pushMutation = useMutation(
    gitRunStackedActionMutationOptions({ cwd: gitCwd, queryClient }),
  );

  const isMutating =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    commitMutation.isPending ||
    stashMutation.isPending ||
    pushMutation.isPending ||
    pullMutation.isPending;

  const clearSelection = useCallback(() => setSelectedPaths(new Set()), []);

  const togglePath = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAllInSection = useCallback((paths: string[], allSelected: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) {
        if (allSelected) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  }, []);

  const stageFiles = useCallback(
    (filePaths: string[]) => {
      if (filePaths.length > 0)
        stageMutation.mutate(filePaths, { onSuccess: () => clearSelection() });
    },
    [stageMutation, clearSelection],
  );

  const unstageFiles = useCallback(
    (filePaths: string[]) => {
      if (filePaths.length > 0)
        unstageMutation.mutate(filePaths, { onSuccess: () => clearSelection() });
    },
    [unstageMutation, clearSelection],
  );

  const handleCommit = useCallback(
    (action: "commit" | "commit_push" | "commit_push_pr") => {
      const message = commitMessage.trim();
      const stagedPaths = detailedStatus?.staged.map((f) => f.path);
      commitMutation.mutate(
        {
          actionId: crypto.randomUUID(),
          action,
          ...(message ? { commitMessage: message } : {}),
          ...(stagedPaths && stagedPaths.length > 0 ? { filePaths: stagedPaths } : {}),
        },
        {
          onSuccess: () => {
            setCommitMessage(threadId, "");
            clearSelection();
          },
        },
      );
    },
    [commitMessage, commitMutation, detailedStatus, setCommitMessage, threadId, clearSelection],
  );

  const handleStashSelected = useCallback(() => {
    if (selectedPaths.size === 0) return;
    setStashMessage("");
    setIncludeUntracked(false);
    setStashDialogOpen(true);
  }, [selectedPaths.size]);

  const confirmStash = useCallback(() => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;
    const msg = stashMessage.trim();
    stashMutation.mutate(
      {
        filePaths: paths,
        ...(msg ? { message: msg } : {}),
        ...(includeUntracked ? { includeUntracked: true } : {}),
      },
      {
        onSuccess: () => {
          clearSelection();
          setStashDialogOpen(false);
          setActiveTab(threadId, "stash");
        },
      },
    );
  }, [
    selectedPaths,
    stashMessage,
    includeUntracked,
    stashMutation,
    clearSelection,
    setActiveTab,
    threadId,
  ]);

  const handleGenerateMessage = useCallback(() => {
    generateMutation.mutate(undefined, {
      onSuccess: (result) => {
        const message = result.body ? `${result.subject}\n\n${result.body}` : result.subject;
        setCommitMessage(threadId, message);
      },
    });
  }, [generateMutation, setCommitMessage, threadId]);

  const handlePush = useCallback(() => {
    pushMutation.mutate({
      actionId: crypto.randomUUID(),
      action: "commit_push",
    });
  }, [pushMutation]);

  const handlePull = useCallback(() => {
    pullMutation.mutate();
  }, [pullMutation]);

  const openFileInEditor = useCallback(
    (filePath: string) => {
      if (gitCwd) openFile(threadId, gitCwd, filePath);
    },
    [gitCwd, openFile, threadId],
  );

  if (!gitCwd) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No git repository available.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const staged = detailedStatus?.staged ?? [];
  const unstaged = detailedStatus?.unstaged ?? [];
  const untracked = detailedStatus?.untracked ?? [];
  const isEmpty = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  const hasStaged = staged.length > 0;
  const hasSelection = selectedPaths.size > 0;
  const aheadCount = detailedStatus?.aheadCount ?? 0;
  const behindCount = detailedStatus?.behindCount ?? 0;
  const hasUpstream = detailedStatus?.hasUpstream ?? false;

  // Compute per-section selection state
  const stagedPaths = staged.map((f) => f.path);
  const unstagedPaths = unstaged.map((f) => f.path);
  const untrackedPaths = untracked.map((f) => f.path);

  const selectedInStaged = stagedPaths.filter((p) => selectedPaths.has(p));
  const selectedInUnstaged = unstagedPaths.filter((p) => selectedPaths.has(p));
  const selectedInUntracked = untrackedPaths.filter((p) => selectedPaths.has(p));

  const allStagedSelected =
    stagedPaths.length > 0 && selectedInStaged.length === stagedPaths.length;
  const allUnstagedSelected =
    unstagedPaths.length > 0 && selectedInUnstaged.length === unstagedPaths.length;
  const allUntrackedSelected =
    untrackedPaths.length > 0 && selectedInUntracked.length === untrackedPaths.length;

  return (
    <div className="flex h-full flex-col">
      {/* Commit message + action buttons */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Textarea
            placeholder="Commit message (optional)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(threadId, e.target.value)}
            rows={2}
            className="resize-none pr-8 text-xs"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1"
            disabled={!hasStaged || generateMutation.isPending}
            onClick={handleGenerateMessage}
            title="Generate commit message with AI"
          >
            {generateMutation.isPending ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <SparklesIcon className="size-3" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="default"
            size="xs"
            disabled={!hasStaged || isMutating}
            onClick={() => handleCommit("commit")}
          >
            <GitCommitIcon className="size-3" />
            Commit
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!hasStaged || isMutating}
            onClick={() => handleCommit("commit_push")}
          >
            <CloudUploadIcon className="size-3" />
            Commit & Push
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!hasStaged || isMutating}
            onClick={() => handleCommit("commit_push_pr")}
          >
            <GitPullRequestIcon className="size-3" />
            C+P+PR
          </Button>
          <div className="flex-1" />
          {hasSelection && (
            <Button
              variant="outline"
              size="xs"
              disabled={isMutating}
              onClick={handleStashSelected}
              title="Stash selected files"
            >
              <PackageIcon className="size-3" />
              Stash
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              void refetch();
              void invalidateGitQueries(queryClient);
            }}
            disabled={isMutating}
            aria-label="Refresh status"
          >
            <RefreshCwIcon className="size-3" />
          </Button>
        </div>
      </div>

      {/* File sections */}
      <div className="flex-1 overflow-auto">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground">
            <CheckIcon className="size-5" />
            Working tree clean
            {/* Sync status: push/pull buttons when there are unpushed/unpulled commits */}
            {(aheadCount > 0 || behindCount > 0) && (
              <div className="flex items-center gap-2">
                {aheadCount > 0 && (
                  <Button variant="outline" size="xs" disabled={isMutating} onClick={handlePush}>
                    {pushMutation.isPending ? (
                      <LoaderIcon className="size-3 animate-spin" />
                    ) : (
                      <ArrowUpIcon className="size-3" />
                    )}
                    Push {aheadCount} commit{aheadCount !== 1 ? "s" : ""}
                  </Button>
                )}
                {behindCount > 0 && (
                  <Button variant="outline" size="xs" disabled={isMutating} onClick={handlePull}>
                    {pullMutation.isPending ? (
                      <LoaderIcon className="size-3 animate-spin" />
                    ) : (
                      <ArrowDownIcon className="size-3" />
                    )}
                    Pull {behindCount} commit{behindCount !== 1 ? "s" : ""}
                  </Button>
                )}
              </div>
            )}
            {hasUpstream && aheadCount === 0 && behindCount === 0 && (
              <span className="text-[10px]">Up to date with remote</span>
            )}
          </div>
        )}

        {/* Staged files */}
        {staged.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allStagedSelected}
                onChange={() => toggleAllInSection(stagedPaths, allStagedSelected)}
                className="size-3 shrink-0 accent-primary"
              />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Staged ({staged.length})
              </span>
              {selectedInStaged.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => unstageFiles(selectedInStaged)}
                >
                  Unstage Selected
                </button>
              )}
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => unstageFiles(stagedPaths)}
              >
                Unstage All
              </button>
            </div>
            {staged.map((file) => (
              <FileRow
                key={file.path}
                path={file.path}
                status={file.status}
                insertions={file.insertions}
                deletions={file.deletions}
                actionIcon="unstage"
                onAction={() => unstageFiles([file.path])}
                onClickFile={() => openFileInEditor(file.path)}
                checked={selectedPaths.has(file.path)}
                onToggle={() => togglePath(file.path)}
              />
            ))}
          </div>
        )}

        {/* Unstaged changes */}
        {unstaged.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allUnstagedSelected}
                onChange={() => toggleAllInSection(unstagedPaths, allUnstagedSelected)}
                className="size-3 shrink-0 accent-primary"
              />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Changes ({unstaged.length})
              </span>
              {selectedInUnstaged.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => stageFiles(selectedInUnstaged)}
                >
                  Stage Selected
                </button>
              )}
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => stageFiles(unstagedPaths)}
              >
                Stage All
              </button>
            </div>
            {unstaged.map((file) => (
              <FileRow
                key={file.path}
                path={file.path}
                status={file.status}
                insertions={file.insertions}
                deletions={file.deletions}
                actionIcon="stage"
                onAction={() => stageFiles([file.path])}
                onClickFile={() => openFileInEditor(file.path)}
                checked={selectedPaths.has(file.path)}
                onToggle={() => togglePath(file.path)}
              />
            ))}
          </div>
        )}

        {/* Untracked files */}
        {untracked.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allUntrackedSelected}
                onChange={() => toggleAllInSection(untrackedPaths, allUntrackedSelected)}
                className="size-3 shrink-0 accent-primary"
              />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Untracked ({untracked.length})
              </span>
              {selectedInUntracked.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => stageFiles(selectedInUntracked)}
                >
                  Stage Selected
                </button>
              )}
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => stageFiles(untrackedPaths)}
              >
                Stage All
              </button>
            </div>
            {untracked.map((file) => (
              <FileRow
                key={file.path}
                path={file.path}
                actionIcon="stage"
                onAction={() => stageFiles([file.path])}
                onClickFile={() => openFileInEditor(file.path)}
                checked={selectedPaths.has(file.path)}
                onToggle={() => togglePath(file.path)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stash Selected Dialog */}
      <Dialog open={stashDialogOpen} onOpenChange={setStashDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Stash Selected Files</DialogTitle>
            <DialogDescription>
              Stash {selectedPaths.size} selected file{selectedPaths.size !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Stash message (optional)"
                value={stashMessage}
                onChange={(e) => setStashMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmStash();
                }}
                className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={includeUntracked} onCheckedChange={setIncludeUntracked} />
                Include untracked files
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStashDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={stashMutation.isPending} onClick={confirmStash}>
              {stashMutation.isPending ? "Stashing..." : "Stash"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
});
