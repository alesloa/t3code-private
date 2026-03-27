import { type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderIcon,
  PackageOpenIcon,
  PlusIcon,
  TrashIcon,
  UndoIcon,
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
import {
  gitStashApplyMutationOptions,
  gitStashCreateMutationOptions,
  gitStashDropMutationOptions,
  gitStashListQueryOptions,
  gitStashPopMutationOptions,
  gitStashRestoreFileMutationOptions,
  gitStashShowFileQueryOptions,
  gitStashShowFilesQueryOptions,
} from "~/lib/gitReactQuery";

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

function StashFileDiff({ cwd, index, filePath }: { cwd: string; index: number; filePath: string }) {
  const { data, isLoading } = useQuery(gitStashShowFileQueryOptions(cwd, index, filePath));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.diff) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No diff available.</p>;
  }

  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {data.diff}
    </pre>
  );
}

function StashFileList({
  cwd,
  index,
  onRestoreFile,
  isRestoring,
}: {
  cwd: string;
  index: number;
  onRestoreFile: (filePath: string) => void;
  isRestoring: boolean;
}) {
  const { data, isLoading } = useQuery(gitStashShowFilesQueryOptions(cwd, index));
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const files = data?.files ?? [];
  if (files.length === 0) {
    return <p className="px-4 py-2 text-xs text-muted-foreground">No files in this stash.</p>;
  }

  return (
    <div className="border-t border-border/50">
      {files.map((file) => (
        <div key={file.path}>
          <div className="group flex items-center gap-1.5 px-4 py-0.5 text-xs hover:bg-accent/30">
            <StatusBadge status={file.status} />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left font-mono text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
              title={file.path}
            >
              {file.path}
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
              onClick={() => onRestoreFile(file.path)}
              disabled={isRestoring}
              title="Restore this file"
            >
              <UndoIcon className="size-3" />
            </button>
          </div>
          {expandedFile === file.path && (
            <StashFileDiff cwd={cwd} index={index} filePath={file.path} />
          )}
        </div>
      ))}
    </div>
  );
}

function StashEntryRow({
  index,
  message,
  date,
  cwd,
  onApply,
  onPop,
  onDrop,
  onRestoreFile,
  isRestoring,
}: {
  index: number;
  message: string;
  date: string;
  cwd: string;
  onApply: () => void;
  onPop: () => void;
  onDrop: () => void;
  onRestoreFile: (filePath: string) => void;
  isRestoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="group flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-accent/40">
        <button
          type="button"
          className="shrink-0 rounded p-0.5 hover:bg-accent"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-3 text-muted-foreground" />
          )}
        </button>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{index}</span>
        <span className="min-w-0 flex-1 truncate font-mono" title={message}>
          {message}
        </span>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{date}</span>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-0.5 hover:bg-accent"
            onClick={onApply}
            title="Apply (keep stash)"
          >
            <ArchiveRestoreIcon className="size-3" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-accent"
            onClick={onPop}
            title="Pop (apply + remove)"
          >
            <PackageOpenIcon className="size-3" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-destructive/20"
            onClick={onDrop}
            title="Drop"
          >
            <TrashIcon className="size-3" />
          </button>
        </div>
      </div>
      {expanded && (
        <StashFileList
          cwd={cwd}
          index={index}
          onRestoreFile={onRestoreFile}
          isRestoring={isRestoring}
        />
      )}
    </div>
  );
}

export default memo(function StashTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const { data: stashData, isLoading } = useQuery(gitStashListQueryOptions(gitCwd));

  const createMutation = useMutation(gitStashCreateMutationOptions({ cwd: gitCwd, queryClient }));
  const applyMutation = useMutation(gitStashApplyMutationOptions({ cwd: gitCwd, queryClient }));
  const popMutation = useMutation(gitStashPopMutationOptions({ cwd: gitCwd, queryClient }));
  const dropMutation = useMutation(gitStashDropMutationOptions({ cwd: gitCwd, queryClient }));
  const restoreFileMutation = useMutation(
    gitStashRestoreFileMutationOptions({ cwd: gitCwd, queryClient }),
  );

  const handleCreate = useCallback(() => {
    const msg = stashMessage.trim();
    const payload: { message?: string; includeUntracked?: boolean } = {};
    if (msg) payload.message = msg;
    if (includeUntracked) payload.includeUntracked = true;
    createMutation.mutate(payload, {
      onSuccess: () => {
        setStashMessage("");
        setIncludeUntracked(false);
        setCreateDialogOpen(false);
      },
    });
  }, [stashMessage, includeUntracked, createMutation]);

  const handleDrop = useCallback(() => {
    if (dropTarget === null) return;
    dropMutation.mutate(dropTarget, { onSettled: () => setDropTarget(null) });
  }, [dropTarget, dropMutation]);

  const handleRestoreFile = useCallback(
    (index: number, filePath: string) => {
      restoreFileMutation.mutate({ index, filePath });
    },
    [restoreFileMutation],
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

  const entries = stashData?.entries ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header with Create button */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Stashes ({entries.length})
        </span>
        <Button variant="outline" size="icon-xs" onClick={() => setCreateDialogOpen(true)}>
          <PlusIcon className="size-3" />
        </Button>
      </div>

      {/* Stash list */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No stash entries.</p>
        )}
        {entries.map((entry) => (
          <StashEntryRow
            key={entry.index}
            index={entry.index}
            message={entry.message}
            date={entry.date}
            cwd={gitCwd}
            onApply={() => applyMutation.mutate(entry.index)}
            onPop={() => popMutation.mutate(entry.index)}
            onDrop={() => setDropTarget(entry.index)}
            onRestoreFile={(filePath) => handleRestoreFile(entry.index, filePath)}
            isRestoring={restoreFileMutation.isPending}
          />
        ))}
      </div>

      {/* Create Stash Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create Stash</DialogTitle>
            <DialogDescription>Stash your current working tree changes.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Stash message (optional)"
                value={stashMessage}
                onChange={(e) => setStashMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
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
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? "Stashing..." : "Stash"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Drop Confirmation Dialog */}
      <Dialog open={dropTarget !== null} onOpenChange={() => setDropTarget(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Drop Stash</DialogTitle>
            <DialogDescription>
              Are you sure you want to drop <strong>stash@&#123;{dropTarget}&#125;</strong>? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDropTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={dropMutation.isPending}
              onClick={handleDrop}
            >
              {dropMutation.isPending ? "Dropping..." : "Drop"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
});
