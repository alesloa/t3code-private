import type { GitLogEntry, ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { toastManager } from "~/components/ui/toast";
import {
  gitLogQueryOptions,
  gitQueryKeys,
  gitRevertCommitMutationOptions,
  gitSoftResetMutationOptions,
} from "~/lib/gitReactQuery";
import { computeGraphLayout, LANE_WIDTH, NODE_RADIUS, ROW_HEIGHT } from "./graphLayout";

// ── Relative time helper ──────────────────────────────────────────────

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m}m ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h}h ago`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return `${d}d ago`;
  }
  if (diff < MONTH) {
    const w = Math.floor(diff / WEEK);
    return `${w}w ago`;
  }
  if (diff < YEAR) {
    const mo = Math.floor(diff / MONTH);
    return `${mo}mo ago`;
  }
  const y = Math.floor(diff / YEAR);
  return `${y}y ago`;
}

// ── Ref badge helpers ─────────────────────────────────────────────────

/** Deduplicate refs: if both "main" and "origin/main" exist, only keep "main". */
function deduplicateRefs(refs: readonly string[]): string[] {
  const locals = new Set<string>();
  const result: string[] = [];

  // First pass: collect local branch names
  for (const ref of refs) {
    if (!ref.startsWith("origin/") && !ref.startsWith("HEAD") && !ref.startsWith("tag: ")) {
      locals.add(ref);
    }
  }

  for (const ref of refs) {
    // Skip "HEAD -> branch" if we already have the branch itself
    if (ref.startsWith("HEAD -> ")) {
      const branch = ref.slice(8);
      if (locals.has(branch)) continue;
      // Show as just "HEAD" since branch badge is separate
      result.push("HEAD");
      continue;
    }
    // Skip "origin/X" if local "X" exists
    if (ref.startsWith("origin/")) {
      const local = ref.slice(7);
      if (locals.has(local) || local === "HEAD") continue;
    }
    result.push(ref);
  }

  return result;
}

function RefBadge({ name }: { name: string }) {
  const isHead = name === "HEAD";
  const isTag = name.startsWith("tag: ");
  const label = isTag ? name.slice(5) : name;
  const bg = isHead
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : isTag
      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
      : "bg-blue-500/20 text-blue-300 border-blue-500/30";

  return (
    <span
      className={`shrink-0 rounded border px-1 py-px font-mono text-[9px] leading-tight ${bg}`}
      title={name}
    >
      {label}
    </span>
  );
}

// ── Context menu ──────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  entry: GitLogEntry;
}

interface ConfirmState {
  action: "uncommit" | "revert";
  entry: GitLogEntry;
}

function ContextMenuItem({
  label,
  description,
  disabled,
  destructive,
  onClick,
}: {
  label: string;
  description?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${destructive ? "text-red-400" : "text-foreground"}`}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span>{label}</span>
      {hovered && description && (
        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{description}</p>
      )}
    </button>
  );
}

function ConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const shortSha = state.entry.sha.slice(0, 8);

  const title = state.action === "uncommit" ? "Uncommit this commit?" : "Revert this commit?";
  const description =
    state.action === "uncommit"
      ? `This will soft-reset HEAD before ${shortSha}. The commit will be removed but all changes will remain staged in your working tree.`
      : `This will create a new commit that undoes the changes from ${shortSha}. The original commit stays in history.`;
  const confirmLabel = state.action === "uncommit" ? "Uncommit" : "Revert";

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-mono text-foreground">{shortSha}</span> {state.entry.subject}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommitContextMenu({
  state,
  onClose,
  onCopySha,
  onUncommit,
  onRevert,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onCopySha: (sha: string) => void;
  onUncommit: (entry: GitLogEntry) => void;
  onRevert: (sha: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasParent = state.entry.parents.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position so the menu stays within the viewport
  const style = useMemo(() => {
    const menuWidth = 260;
    const menuHeight = 120;
    const x = Math.min(state.x, window.innerWidth - menuWidth - 8);
    const y = Math.min(state.y, window.innerHeight - menuHeight - 8);
    return { left: x, top: y };
  }, [state.x, state.y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[260px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
      style={style}
    >
      <ContextMenuItem
        label="Copy SHA"
        onClick={() => {
          onCopySha(state.entry.sha);
          onClose();
        }}
      />
      <div className="my-1 border-t border-border" />
      <ContextMenuItem
        label="Uncommit (soft reset)"
        description="Removes the commit but keeps all changes staged in your working tree."
        disabled={!hasParent}
        destructive
        onClick={() => {
          if (hasParent) {
            onUncommit(state.entry);
            onClose();
          }
        }}
      />
      <ContextMenuItem
        label="Revert"
        description="Creates a new commit that undoes this commit's changes. History is preserved."
        destructive
        onClick={() => {
          onRevert(state.entry.sha);
          onClose();
        }}
      />
    </div>
  );
}

// ── Commit row with tooltip ───────────────────────────────────────────

function CommitRow({
  entry,
  svgWidth,
  dedupedRefs,
  onContextMenu,
}: {
  entry: GitLogEntry;
  svgWidth: number;
  dedupedRefs: string[];
  onContextMenu: (e: React.MouseEvent, entry: GitLogEntry) => void;
}) {
  const timeAgo = relativeTime(entry.authorDate);
  const fullDate = new Date(entry.authorDate).toLocaleString();
  const { body } = entry;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex items-center text-xs hover:bg-accent/30"
            style={{
              height: ROW_HEIGHT,
              paddingLeft: svgWidth + 4,
              position: "relative",
            }}
            onContextMenu={(e) => onContextMenu(e, entry)}
          />
        }
      >
        {/* Refs + subject */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {dedupedRefs.map((ref) => (
            <RefBadge key={`${entry.sha}-${ref}`} name={ref} />
          ))}
          <span className="truncate text-foreground">{entry.subject}</span>
        </div>

        {/* Meta: SHA + time — hidden on very narrow panels */}
        <div className="ml-2 hidden shrink-0 items-center gap-2 pr-2 text-[10px] text-muted-foreground sm:flex">
          <span className="font-mono">{entry.shortSha}</span>
          <span className="w-[52px] text-right">{timeAgo}</span>
        </div>
      </TooltipTrigger>
      <TooltipPopup side="bottom" align="start" className="max-w-sm">
        <p className="font-medium">{entry.subject}</p>
        {body && (
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ whiteSpace: "pre-wrap" }}>
            {body}
          </p>
        )}
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          <p>
            {entry.authorName} &middot; {fullDate}
          </p>
          <p className="select-all font-mono">{entry.sha}</p>
          {entry.refs.length > 0 && <p>Refs: {entry.refs.join(", ")}</p>}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

// ── Main component ────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default memo(function GraphTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const [skip, setSkip] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery(
    gitLogQueryOptions(gitCwd, { skip, maxCount: PAGE_SIZE }),
  );

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const hasMore = data?.hasMore ?? false;

  const layout = useMemo(() => computeGraphLayout(entries), [entries]);
  const dedupedRefsMap = useMemo(
    () => new Map(entries.map((e) => [e.sha, deduplicateRefs(e.refs)])),
    [entries],
  );

  const svgWidth = LANE_WIDTH * (layout.maxColumns + 2);
  const svgHeight = entries.length * ROW_HEIGHT;

  // ── Mutations ───────────────────────────────────────────────────────
  const softResetMutation = useMutation(gitSoftResetMutationOptions({ cwd: gitCwd, queryClient }));
  const revertCommitMutation = useMutation(
    gitRevertCommitMutationOptions({ cwd: gitCwd, queryClient }),
  );

  // ── Context menu handlers ───────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: GitLogEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopySha = useCallback((sha: string) => {
    if (!navigator.clipboard?.writeText) {
      toastManager.add({ type: "error", title: "Clipboard API unavailable" });
      return;
    }
    navigator.clipboard.writeText(sha).then(
      () => toastManager.add({ type: "success", title: "SHA copied to clipboard" }),
      () => toastManager.add({ type: "error", title: "Failed to copy SHA" }),
    );
  }, []);

  const handleUncommit = useCallback((entry: GitLogEntry) => {
    setConfirmDialog({ action: "uncommit", entry });
  }, []);

  const handleRevert = useCallback(
    (sha: string) => {
      // Find the entry for context in the confirm dialog
      const entry = entries.find((e) => e.sha === sha);
      if (!entry) return;
      setConfirmDialog({ action: "revert", entry });
    },
    [entries],
  );

  const handleConfirmAction = useCallback(() => {
    if (!confirmDialog) return;
    const { action, entry } = confirmDialog;
    setConfirmDialog(null);

    if (action === "uncommit") {
      const parentSha = entry.parents[0];
      if (!parentSha) return;
      softResetMutation.mutate(parentSha, {
        onSuccess: () => {
          toastManager.add({ type: "success", title: "Commit undone (soft reset)" });
          void queryClient.invalidateQueries({ queryKey: gitQueryKeys.all });
        },
        onError: (err) => {
          toastManager.add({
            type: "error",
            title: "Uncommit failed",
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      });
    } else {
      revertCommitMutation.mutate(entry.sha, {
        onSuccess: () => {
          toastManager.add({ type: "success", title: "Revert commit created" });
          void queryClient.invalidateQueries({ queryKey: gitQueryKeys.all });
        },
        onError: (err) => {
          toastManager.add({
            type: "error",
            title: "Revert failed",
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      });
    }
  }, [confirmDialog, softResetMutation, revertCommitMutation, queryClient]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  if (!gitCwd) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No git repository available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Commit list */}
      <div className="flex-1 overflow-auto">
        {isLoading && entries.length === 0 && (
          <div className="flex items-center justify-center p-4">
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Failed to load commit history.
          </p>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No commits found.</p>
        )}

        {entries.length > 0 && (
          <div className="relative" style={{ minHeight: svgHeight }}>
            {/* SVG graph lines */}
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={svgWidth}
              height={svgHeight}
              style={{ zIndex: 0 }}
            >
              {layout.edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.pathData}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
              ))}
              {layout.nodes.map((node) => (
                <circle
                  key={node.sha}
                  cx={LANE_WIDTH + node.column * LANE_WIDTH}
                  cy={ROW_HEIGHT / 2 + node.row * ROW_HEIGHT}
                  r={NODE_RADIUS}
                  fill={node.color}
                />
              ))}
            </svg>

            {/* Commit rows */}
            {entries.map((entry) => (
              <CommitRow
                key={entry.sha}
                entry={entry}
                svgWidth={svgWidth}
                dedupedRefs={dedupedRefsMap.get(entry.sha) ?? []}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {(hasMore || skip > 0) && (
          <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-2">
            {skip > 0 && (
              <button
                type="button"
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                Newer
              </button>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={() => setSkip(skip + PAGE_SIZE)}
                className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                Older
              </button>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <CommitContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
          onCopySha={handleCopySha}
          onUncommit={handleUncommit}
          onRevert={handleRevert}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          state={confirmDialog}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
});
