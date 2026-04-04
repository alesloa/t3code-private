import { type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  EllipsisIcon,
  FileIcon,
  GitPullRequestIcon,
  LoaderIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PackageIcon,
  Undo2Icon,
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
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { useFileEditorStore } from "~/fileEditorStore";
import { useGitPanelStore } from "~/gitPanelStore";
import {
  gitDiscardChangesMutationOptions,
  gitGenerateCommitMessageMutationOptions,
  gitRunStackedActionMutationOptions,
  gitStageFilesMutationOptions,
  gitStashCreateMutationOptions,
  gitStatusDetailedQueryOptions,
  gitUnstageFilesMutationOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";

// ── Helpers ──────────────────────────────────────────────────────────

function StatusLetter({ status }: { status: string }) {
  const colorClass =
    status === "added"
      ? "text-success"
      : status === "deleted"
        ? "text-destructive"
        : status === "renamed"
          ? "text-info"
          : "text-warning";
  const letter = status[0]?.toUpperCase() ?? "?";
  return (
    <span className={`shrink-0 font-mono text-[11px] font-semibold ${colorClass}`}>{letter}</span>
  );
}

function FileRow({
  path,
  status,
  actionIcon,
  onAction,
  onClickFile,
  onStage,
  onUnstage,
  onDiscard,
  onStash,
}: {
  path: string;
  status?: string;
  actionIcon: "stage" | "unstage";
  onAction: () => void;
  onClickFile: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onStash?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  return (
    <Menu open={menuOpen} onOpenChange={setMenuOpen}>
      <MenuTrigger
        render={
          <div
            className="group flex cursor-default items-center gap-1.5 px-3 py-0.5 pl-6 text-xs hover:bg-accent/40"
            onClick={onClickFile}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuAnchor({ x: e.clientX, y: e.clientY });
              setMenuOpen(true);
            }}
          />
        }
      >
        {!status && <FileIcon className="size-3 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-left font-mono" title={path}>
          {path}
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          aria-label={actionIcon === "stage" ? "Stage file" : "Unstage file"}
        >
          {actionIcon === "stage" ? (
            <PlusIcon className="size-3" />
          ) : (
            <MinusIcon className="size-3" />
          )}
        </button>
        {status && <StatusLetter status={status} />}
      </MenuTrigger>
      <MenuPopup
        anchor={
          menuAnchor
            ? {
                getBoundingClientRect: () =>
                  DOMRect.fromRect({ x: menuAnchor.x, y: menuAnchor.y, width: 0, height: 0 }),
              }
            : undefined
        }
      >
        <MenuItem onClick={onClickFile}>Open File</MenuItem>
        <MenuSeparator />
        {onStage && <MenuItem onClick={onStage}>Stage Changes</MenuItem>}
        {onUnstage && <MenuItem onClick={onUnstage}>Unstage Changes</MenuItem>}
        {onDiscard && (
          <MenuItem onClick={onDiscard} variant="destructive">
            <Undo2Icon className="size-3.5" />
            Discard Changes
          </MenuItem>
        )}
        {onStash && (
          <>
            <MenuSeparator />
            <MenuItem onClick={onStash}>
              <PackageIcon className="size-3.5" />
              Stash File
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
  actions,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent/30">
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1">
        {collapsed ? (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium">{label}</span>
      </button>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">{actions}</div>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default memo(function ChangesSection({
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

  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [stashDialogPaths, setStashDialogPaths] = useState<string[]>([]);
  const [stashMessage, setStashMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [commitExpanded, setCommitExpanded] = useState(false);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(false);
  const [untrackedCollapsed, setUntrackedCollapsed] = useState(false);

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
  const discardMutation = useMutation(
    gitDiscardChangesMutationOptions({ cwd: gitCwd, queryClient }),
  );
  const generateMutation = useMutation(gitGenerateCommitMessageMutationOptions({ cwd: gitCwd }));

  const isMutating =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    commitMutation.isPending ||
    stashMutation.isPending;

  const stageFiles = useCallback(
    (filePaths: string[]) => {
      if (filePaths.length > 0) stageMutation.mutate(filePaths);
    },
    [stageMutation],
  );

  const unstageFiles = useCallback(
    (filePaths: string[]) => {
      if (filePaths.length > 0) unstageMutation.mutate(filePaths);
    },
    [unstageMutation],
  );

  const discardFiles = useCallback(
    (filePaths: string[]) => {
      if (filePaths.length > 0) discardMutation.mutate(filePaths);
    },
    [discardMutation],
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
          },
        },
      );
    },
    [commitMessage, commitMutation, detailedStatus, setCommitMessage, threadId],
  );

  const openStashDialog = useCallback((paths: string[]) => {
    setStashDialogPaths(paths);
    setStashMessage("");
    setIncludeUntracked(false);
    setStashDialogOpen(true);
  }, []);

  const confirmStash = useCallback(() => {
    if (stashDialogPaths.length === 0) return;
    const msg = stashMessage.trim();
    stashMutation.mutate(
      {
        filePaths: stashDialogPaths,
        ...(msg ? { message: msg } : {}),
        ...(includeUntracked ? { includeUntracked: true } : {}),
      },
      {
        onSuccess: () => {
          setStashDialogOpen(false);
          setActiveTab(threadId, "stash");
        },
      },
    );
  }, [stashDialogPaths, stashMessage, includeUntracked, stashMutation, setActiveTab, threadId]);

  const handleGenerateMessage = useCallback(() => {
    generateMutation.mutate(undefined, {
      onSuccess: (result) => {
        const message = result.body ? `${result.subject}\n\n${result.body}` : result.subject;
        setCommitMessage(threadId, message);
      },
    });
  }, [generateMutation, setCommitMessage, threadId]);

  const openFileInEditor = useCallback(
    (filePath: string) => {
      if (gitCwd) openFile(threadId, gitCwd, filePath);
    },
    [gitCwd, openFile, threadId],
  );

  // ── Early returns ──────────────────────────────────────────────────

  if (!gitCwd) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        No git repository available.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────

  const staged = detailedStatus?.staged ?? [];
  const unstaged = detailedStatus?.unstaged ?? [];
  const untracked = detailedStatus?.untracked ?? [];
  const totalChanges = staged.length + unstaged.length + untracked.length;
  const isEmpty = totalChanges === 0;
  const hasStaged = staged.length > 0;
  const hasUpstream = detailedStatus?.hasUpstream ?? false;
  const aheadCount = detailedStatus?.aheadCount ?? 0;
  const behindCount = detailedStatus?.behindCount ?? 0;

  const allUnstagedAndUntracked = [...unstaged.map((f) => f.path), ...untracked.map((f) => f.path)];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {/* ─── Commit message input ─── */}
      <div className="border-t border-border px-3 py-2">
        <div className="relative">
          <Textarea
            placeholder="Commit message (optional)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(threadId, e.target.value)}
            rows={commitExpanded ? 5 : 1}
            size="sm"
            className="resize-none pr-14 text-xs"
          />
          <div className="absolute right-1 top-1 flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCommitExpanded((v) => !v)}
              title={commitExpanded ? "Collapse" : "Expand"}
            >
              {commitExpanded ? (
                <Minimize2Icon className="size-3" />
              ) : (
                <Maximize2Icon className="size-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
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
        </div>
      </div>

      {/* ─── Commit toolbar ─── */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
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
        <div className="flex items-center">
          <Button
            variant="default"
            size="xs"
            disabled={!hasStaged || isMutating}
            onClick={() => handleCommit("commit")}
            className="rounded-r-none"
          >
            Commit Tracked
          </Button>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="default"
                  size="xs"
                  disabled={!hasStaged || isMutating}
                  className="rounded-l-none border-l border-primary-foreground/20 px-1"
                  aria-label="Commit options"
                />
              }
            >
              <ChevronDownIcon className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => handleCommit("commit")}>Commit</MenuItem>
              <MenuItem onClick={() => handleCommit("commit_push")}>
                <CloudUploadIcon className="size-3.5" />
                Commit & Push
              </MenuItem>
              <MenuItem onClick={() => handleCommit("commit_push_pr")}>
                <GitPullRequestIcon className="size-3.5" />
                Commit, Push & PR
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      {/* ─── Changes header bar ─── */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
        <span className="text-xs font-medium">
          {totalChanges} Change{totalChanges !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="More actions" />}
            >
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                onClick={() => {
                  void refetch();
                  void invalidateGitQueries(queryClient);
                }}
              >
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </MenuItem>
            </MenuPopup>
          </Menu>
          {allUnstagedAndUntracked.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={isMutating}
              onClick={() => stageFiles(allUnstagedAndUntracked)}
              className="text-xs"
            >
              Stage All
            </Button>
          ) : hasStaged ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={isMutating}
              onClick={() => unstageFiles(staged.map((f) => f.path))}
              className="text-xs"
            >
              Unstage All
            </Button>
          ) : null}
        </div>
      </div>

      {/* ─── File list ─── */}
      <div className="overflow-auto">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
            <CheckIcon className="size-5" />
            Working tree clean
            {hasUpstream && aheadCount === 0 && behindCount === 0 && (
              <span className="text-[10px]">Up to date with remote</span>
            )}
          </div>
        )}

        {/* Staged files */}
        {staged.length > 0 && (
          <div>
            <SectionHeader
              label="Staged Changes"
              count={staged.length}
              collapsed={stagedCollapsed}
              onToggle={() => setStagedCollapsed((v) => !v)}
              actions={
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => unstageFiles(staged.map((f) => f.path))}
                  aria-label="Unstage all"
                  title="Unstage All"
                >
                  <MinusIcon className="size-3" />
                </button>
              }
            />
            {!stagedCollapsed &&
              staged.map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  status={file.status}
                  actionIcon="unstage"
                  onAction={() => unstageFiles([file.path])}
                  onClickFile={() => openFileInEditor(file.path)}
                  onStage={() => stageFiles([file.path])}
                  onUnstage={() => unstageFiles([file.path])}
                  onDiscard={() => discardFiles([file.path])}
                  onStash={() => openStashDialog([file.path])}
                />
              ))}
          </div>
        )}

        {/* Unstaged changes */}
        {unstaged.length > 0 && (
          <div>
            <SectionHeader
              label="Changes"
              count={unstaged.length}
              collapsed={changesCollapsed}
              onToggle={() => setChangesCollapsed((v) => !v)}
              actions={
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => stageFiles(unstaged.map((f) => f.path))}
                  aria-label="Stage all changes"
                  title="Stage All"
                >
                  <PlusIcon className="size-3" />
                </button>
              }
            />
            {!changesCollapsed &&
              unstaged.map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  status={file.status}
                  actionIcon="stage"
                  onAction={() => stageFiles([file.path])}
                  onClickFile={() => openFileInEditor(file.path)}
                  onStage={() => stageFiles([file.path])}
                  onDiscard={() => discardFiles([file.path])}
                  onStash={() => openStashDialog([file.path])}
                />
              ))}
          </div>
        )}

        {/* Untracked files */}
        {untracked.length > 0 && (
          <div>
            <SectionHeader
              label="Untracked"
              count={untracked.length}
              collapsed={untrackedCollapsed}
              onToggle={() => setUntrackedCollapsed((v) => !v)}
              actions={
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => stageFiles(untracked.map((f) => f.path))}
                  aria-label="Stage all untracked"
                  title="Stage All"
                >
                  <PlusIcon className="size-3" />
                </button>
              }
            />
            {!untrackedCollapsed &&
              untracked.map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  actionIcon="stage"
                  onAction={() => stageFiles([file.path])}
                  onClickFile={() => openFileInEditor(file.path)}
                  onStage={() => stageFiles([file.path])}
                />
              ))}
          </div>
        )}
      </div>

      {/* ─── Stash Dialog ─── */}
      <Dialog open={stashDialogOpen} onOpenChange={setStashDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Stash Files</DialogTitle>
            <DialogDescription>
              Stash {stashDialogPaths.length} file{stashDialogPaths.length !== 1 ? "s" : ""}.
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
