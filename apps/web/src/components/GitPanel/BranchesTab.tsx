import { type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  GitBranchIcon,
  LoaderIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

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
import {
  gitBranchesQueryOptions,
  gitCheckoutMutationOptions,
  gitDeleteBranchMutationOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";
import { ensureNativeApi } from "~/nativeApi";

function BranchRow({
  name,
  isCurrent,
  isDefault,
  isRemote,
  onCheckout,
  onDelete,
}: {
  name: string;
  isCurrent: boolean;
  isDefault: boolean;
  isRemote?: boolean;
  onCheckout: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/40">
      {isCurrent ? (
        <CheckIcon className="size-3 shrink-0 text-success" />
      ) : (
        <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className={`min-w-0 flex-1 truncate font-mono ${isCurrent ? "font-semibold" : ""}`}>
        {name}
      </span>
      {isDefault && (
        <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          default
        </span>
      )}
      {!isCurrent && !isRemote && (
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-0.5 hover:bg-accent"
            onClick={onCheckout}
            title="Checkout"
          >
            <CheckIcon className="size-3" />
          </button>
          {!isDefault && (
            <button
              type="button"
              className="rounded p-0.5 hover:bg-destructive/20"
              onClick={onDelete}
              title="Delete"
            >
              <TrashIcon className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(function BranchesTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showRemote, setShowRemote] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: branchList, isLoading } = useQuery(gitBranchesQueryOptions(gitCwd));

  const checkoutMutation = useMutation(gitCheckoutMutationOptions({ cwd: gitCwd, queryClient }));
  const deleteMutation = useMutation(gitDeleteBranchMutationOptions({ cwd: gitCwd, queryClient }));

  const localBranches = useMemo(
    () => branchList?.branches.filter((b) => !b.isRemote) ?? [],
    [branchList],
  );
  const remoteBranches = useMemo(
    () => branchList?.branches.filter((b) => b.isRemote) ?? [],
    [branchList],
  );

  const filteredLocal = useMemo(() => {
    if (!search) return localBranches;
    const q = search.toLowerCase();
    return localBranches.filter((b) => b.name.toLowerCase().includes(q));
  }, [localBranches, search]);

  const filteredRemote = useMemo(() => {
    if (!search) return remoteBranches;
    const q = search.toLowerCase();
    return remoteBranches.filter((b) => b.name.toLowerCase().includes(q));
  }, [remoteBranches, search]);

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name || !gitCwd) return;
    const api = ensureNativeApi();
    await api.git.createBranch({ cwd: gitCwd, branch: name });
    await invalidateGitQueries(queryClient);
    setNewBranchName("");
    setCreateDialogOpen(false);
  }, [newBranchName, gitCwd, queryClient]);

  const handleDeleteBranch = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ branch: deleteTarget }, { onSettled: () => setDeleteTarget(null) });
  }, [deleteTarget, deleteMutation]);

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

  return (
    <div className="flex h-full flex-col">
      {/* Search + Create */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button variant="outline" size="icon-xs" onClick={() => setCreateDialogOpen(true)}>
          <PlusIcon className="size-3" />
        </Button>
      </div>

      {/* Branch lists */}
      <div className="flex-1 overflow-auto">
        {/* Local branches */}
        <div className="px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Local ({filteredLocal.length})
          </span>
        </div>
        {filteredLocal.map((branch) => (
          <BranchRow
            key={branch.name}
            name={branch.name}
            isCurrent={branch.current}
            isDefault={branch.isDefault}
            onCheckout={() => checkoutMutation.mutate(branch.name)}
            onDelete={() => setDeleteTarget(branch.name)}
          />
        ))}
        {filteredLocal.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No matching branches.</p>
        )}

        {/* Remote branches */}
        {remoteBranches.length > 0 && (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              onClick={() => setShowRemote((v) => !v)}
            >
              {showRemote ? "▾" : "▸"} Remote ({filteredRemote.length})
            </button>
            {showRemote &&
              filteredRemote.map((branch) => (
                <BranchRow
                  key={branch.name}
                  name={branch.name}
                  isCurrent={false}
                  isDefault={false}
                  isRemote
                  onCheckout={() => checkoutMutation.mutate(branch.name)}
                  onDelete={() => {}}
                />
              ))}
          </>
        )}
      </div>

      {/* Create Branch Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>Create a new branch from the current HEAD.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <input
              type="text"
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateBranch();
              }}
              className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!newBranchName.trim()}
              onClick={() => void handleCreateBranch()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={handleDeleteBranch}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
});
