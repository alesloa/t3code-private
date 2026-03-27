import { type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpenIcon, GitCommitVerticalIcon, LoaderIcon, TrashIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  gitRemoveWorktreeMutationOptions,
  gitWorktreesQueryOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";

function WorktreeRow({
  path,
  branch,
  isMainWorktree,
  isBare,
  onRemove,
}: {
  path: string;
  branch: string | null;
  isMainWorktree: boolean;
  isBare: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/40">
      {isMainWorktree ? (
        <FolderOpenIcon className="size-3 shrink-0 text-success" />
      ) : (
        <GitCommitVerticalIcon className="size-3 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono">{branch ?? (isBare ? "(bare)" : "(detached)")}</div>
        <div className="truncate text-[10px] text-muted-foreground">{path}</div>
      </div>
      {isMainWorktree && (
        <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          main
        </span>
      )}
      {!isMainWorktree && (
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-0.5 hover:bg-destructive/20"
            onClick={onRemove}
            title="Remove worktree"
          >
            <TrashIcon className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(function WorktreesTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const queryClient = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery(gitWorktreesQueryOptions(gitCwd));

  const removeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));

  const handleRemove = useCallback(() => {
    if (!removeTarget || !gitCwd) return;
    removeMutation.mutate(
      { cwd: gitCwd, path: removeTarget },
      {
        onSettled: () => {
          setRemoveTarget(null);
          void invalidateGitQueries(queryClient);
        },
      },
    );
  }, [removeTarget, gitCwd, removeMutation, queryClient]);

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

  const worktrees = data?.worktrees ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Worktrees ({worktrees.length})
        </span>
      </div>

      {/* Worktree list */}
      <div className="flex-1 overflow-auto">
        {worktrees.map((wt) => (
          <WorktreeRow
            key={wt.path}
            path={wt.path}
            branch={wt.branch}
            isMainWorktree={wt.isMainWorktree}
            isBare={wt.isBare}
            onRemove={() => setRemoveTarget(wt.path)}
          />
        ))}
        {worktrees.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No worktrees found.</p>
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeTarget !== null} onOpenChange={() => setRemoveTarget(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Remove Worktree</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this worktree?
              <br />
              <strong className="break-all font-mono text-xs">{removeTarget}</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeMutation.isPending}
              onClick={handleRemove}
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
});
