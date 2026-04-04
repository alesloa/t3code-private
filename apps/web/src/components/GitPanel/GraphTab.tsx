import type { GitLogEntry, ThreadId } from "@t3tools/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { toastManager } from "~/components/ui/toast";
import {
  gitQueryKeys,
  gitRevertCommitMutationOptions,
  gitSoftResetMutationOptions,
} from "~/lib/gitReactQuery";
import { ensureNativeApi } from "~/nativeApi";
import {
  type HistoryItemViewModel,
  CIRCLE_RADIUS,
  CIRCLE_STROKE_WIDTH,
  GRAPH_REF_COLOR,
  SWIMLANE_CURVE_RADIUS,
  SWIMLANE_HEIGHT,
  SWIMLANE_WIDTH,
  findLastSwimlaneIndex,
  getCircleInfo,
  toViewModelArray,
} from "./graphLayout";

// ── Shorthand constants ──────────────────────────────────────────────

const SW = SWIMLANE_WIDTH;
const SH = SWIMLANE_HEIGHT;
const CR = SWIMLANE_CURVE_RADIUS;

// ── Monolithic graph SVG computation ─────────────────────────────────
// Produces all paths and circles for the entire commit list in a single
// coordinate space. This guarantees lines connect seamlessly between
// rows — no gaps possible since everything is in one SVG.

interface GPath {
  d: string;
  color: string;
}
interface GCircle {
  cx: number;
  cy: number;
  r: number;
  color: string;
  kind: "node" | "head-outer" | "head-inner" | "merge-outer" | "merge-inner";
}
interface MonolithicGraph {
  paths: GPath[];
  circles: GCircle[];
  width: number;
  height: number;
}

function computeMonolithicGraph(viewModels: readonly HistoryItemViewModel[]): MonolithicGraph {
  const paths: GPath[] = [];
  const circles: GCircle[] = [];
  let maxCols = 1;

  for (let row = 0; row < viewModels.length; row++) {
    const vm = viewModels[row]!;
    const { entry, inputSwimlanes, outputSwimlanes } = vm;
    const y = row * SH;

    // Track max columns including the circle position (which can be one
    // past the end of the lane arrays for new commits).
    const inputIndex = inputSwimlanes.findIndex((n) => n.id === entry.sha);
    const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
    const circleColor =
      circleIndex < outputSwimlanes.length
        ? outputSwimlanes[circleIndex]!.color
        : circleIndex < inputSwimlanes.length
          ? inputSwimlanes[circleIndex]!.color
          : GRAPH_REF_COLOR;

    const cols = Math.max(inputSwimlanes.length, outputSwimlanes.length, circleIndex + 1);
    if (cols > maxCols) maxCols = cols;

    // ── Input swimlane processing (VS Code scmHistory.ts:143-199) ──
    let outputSwimlaneIndex = 0;
    for (let i = 0; i < inputSwimlanes.length; i++) {
      const color = inputSwimlanes[i]!.color;

      if (inputSwimlanes[i]!.id === entry.sha) {
        // Current commit's lane
        if (i !== circleIndex) {
          // Merge-back: draw / then - to the circle position
          paths.push({
            d: [
              `M ${SW * (i + 1)} ${y}`,
              `A ${SW} ${SW} 0 0 1 ${SW * i} ${y + SW}`,
              `H ${SW * (circleIndex + 1)}`,
            ].join(" "),
            color,
          });
        } else {
          outputSwimlaneIndex++;
        }
      } else {
        // Not the current commit — pass through or lane-shift
        if (
          outputSwimlaneIndex < outputSwimlanes.length &&
          inputSwimlanes[i]!.id === outputSwimlanes[outputSwimlaneIndex]!.id
        ) {
          if (i === outputSwimlaneIndex) {
            // Straight vertical |
            paths.push({ d: `M ${SW * (i + 1)} ${y} V ${y + SH}`, color });
          } else {
            // Lane shift S-curve: | then / then - then / then |
            const x1 = SW * (i + 1);
            const x2 = SW * (outputSwimlaneIndex + 1);
            paths.push({
              d: [
                `M ${x1} ${y}`,
                `V ${y + 6}`,
                `A ${CR} ${CR} 0 0 1 ${x1 - CR} ${y + SH / 2}`,
                `H ${x2 + CR}`,
                `A ${CR} ${CR} 0 0 0 ${x2} ${y + SH / 2 + CR}`,
                `V ${y + SH}`,
              ].join(" "),
              color,
            });
          }
          outputSwimlaneIndex++;
        }
      }
    }

    // ── Fork lines for additional parents (VS Code scmHistory.ts:203-223) ──
    for (let i = 1; i < entry.parents.length; i++) {
      const pIdx = findLastSwimlaneIndex(outputSwimlanes, entry.parents[i]!);
      if (pIdx === -1) continue;
      const pColor = outputSwimlanes[pIdx]!.color;
      // Draw \ curve from circle midpoint down-right, then - back to circle
      paths.push({
        d: [
          `M ${SW * pIdx} ${y + SH / 2}`,
          `A ${SW} ${SW} 0 0 1 ${SW * (pIdx + 1)} ${y + SH}`,
          `M ${SW * pIdx} ${y + SH / 2}`,
          `H ${SW * (circleIndex + 1)}`,
        ].join(" "),
        color: pColor,
      });
    }

    // ── | to * (vertical line from top of row to circle center) ──
    if (inputIndex !== -1) {
      paths.push({
        d: `M ${SW * (circleIndex + 1)} ${y} V ${y + SH / 2}`,
        color: inputSwimlanes[inputIndex]!.color,
      });
    }

    // ── | from * (vertical line from circle center to bottom of row) ──
    if (entry.parents.length > 0) {
      paths.push({
        d: `M ${SW * (circleIndex + 1)} ${y + SH / 2} V ${y + SH}`,
        color: circleColor,
      });
    }

    // ── Circles (VS Code scmHistory.ts:237-268) ──
    const cx = SW * (circleIndex + 1);
    const cy = y + SW;

    if (vm.kind === "HEAD") {
      circles.push({ cx, cy, r: CIRCLE_RADIUS + 3, color: circleColor, kind: "head-outer" });
      circles.push({ cx, cy, r: CIRCLE_STROKE_WIDTH, color: circleColor, kind: "head-inner" });
    } else if (entry.parents.length > 1) {
      circles.push({ cx, cy, r: CIRCLE_RADIUS + 2, color: circleColor, kind: "merge-outer" });
      circles.push({ cx, cy, r: CIRCLE_RADIUS - 1, color: circleColor, kind: "merge-inner" });
    } else {
      circles.push({ cx, cy, r: CIRCLE_RADIUS + 1, color: circleColor, kind: "node" });
    }
  }

  return {
    paths,
    circles,
    width: SW * (maxCols + 1),
    height: viewModels.length * SH,
  };
}

// ── Relative time helper ─────────────────────────────────────────────

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
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}w ago`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo ago`;
  return `${Math.floor(diff / YEAR)}y ago`;
}

// ── Ref badge helpers ────────────────────────────────────────────────

function deduplicateRefs(refs: readonly string[]): string[] {
  const locals = new Set<string>();
  const result: string[] = [];

  for (const ref of refs) {
    if (!ref.startsWith("origin/") && !ref.startsWith("HEAD") && !ref.startsWith("tag: ")) {
      locals.add(ref);
    }
  }

  for (const ref of refs) {
    if (ref.startsWith("HEAD -> ")) {
      const branch = ref.slice(8);
      if (locals.has(branch)) continue;
      result.push("HEAD");
      continue;
    }
    if (ref.startsWith("origin/")) {
      const local = ref.slice(7);
      if (locals.has(local) || local === "HEAD") continue;
    }
    result.push(ref);
  }

  return result;
}

function RefBadge({ name, color }: { name: string; color: string }) {
  const isHead = name === "HEAD";
  const isTag = name.startsWith("tag: ");
  const label = isTag ? name.slice(5) : name;

  // VS Code uses solid background with inverted text for colored refs
  const bgColor = isHead ? GRAPH_REF_COLOR : color;

  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-px text-[10px] leading-[18px] font-medium"
      style={{
        backgroundColor: bgColor,
        color: "var(--background)",
      }}
      title={name}
    >
      {label}
    </span>
  );
}

// ── Context menu ─────────────────────────────────────────────────────

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

// ── Commit row (text overlay on top of monolithic SVG) ───────────────

function CommitRow({
  vm,
  graphWidth,
  dedupedRefs,
  onContextMenu,
}: {
  vm: HistoryItemViewModel;
  graphWidth: number;
  dedupedRefs: string[];
  onContextMenu: (e: React.MouseEvent, entry: GitLogEntry) => void;
}) {
  const { entry } = vm;
  const { color: circleColor } = getCircleInfo(vm);
  const timeAgo = relativeTime(entry.authorDate);
  const fullDate = new Date(entry.authorDate).toLocaleString();
  const isHead = vm.kind === "HEAD";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="relative flex items-center text-xs hover:bg-accent/30"
            style={{ height: SH, paddingLeft: graphWidth + 6 }}
            onContextMenu={(e) => onContextMenu(e, entry)}
          />
        }
      >
        {/* Subject + author (VS Code: label comes before badges) */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className={`truncate ${isHead ? "font-semibold text-foreground" : "text-foreground"}`}
          >
            {entry.subject}
          </span>
          <span className="hidden truncate text-muted-foreground sm:inline">
            {entry.authorName}
          </span>
        </div>

        {/* Ref badges (VS Code: label-container after subject) */}
        {dedupedRefs.length > 0 && (
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {dedupedRefs.map((ref) => (
              <RefBadge key={`${entry.sha}-${ref}`} name={ref} color={circleColor} />
            ))}
          </div>
        )}

        {/* SHA + time */}
        <div className="ml-2 hidden shrink-0 items-center gap-2 pr-2 text-[10px] text-muted-foreground sm:flex">
          <span className="font-mono">{entry.shortSha}</span>
          <span className="w-[52px] text-right">{timeAgo}</span>
        </div>
      </TooltipTrigger>
      <TooltipPopup side="bottom" align="start" className="max-w-sm">
        <p className="font-medium">{entry.subject}</p>
        {entry.body && (
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ whiteSpace: "pre-wrap" }}>
            {entry.body}
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

// ── Render a single circle element ───────────────────────────────────

function renderCircle(c: GCircle, i: number) {
  switch (c.kind) {
    case "head-outer":
      return (
        <circle
          key={`co${i}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          className="scm-graph-node"
          style={{ fill: c.color, strokeWidth: `${CIRCLE_STROKE_WIDTH}px` }}
        />
      );
    case "head-inner":
      return (
        <circle
          key={`ci${i}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          className="scm-graph-node scm-graph-node-inner"
          style={{ strokeWidth: `${CIRCLE_RADIUS}px` }}
        />
      );
    case "merge-outer":
    case "merge-inner":
    case "node":
      return (
        <circle
          key={`c${i}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          className="scm-graph-node"
          style={{ fill: c.color, strokeWidth: `${CIRCLE_STROKE_WIDTH}px` }}
        />
      );
  }
}

// ── Main component ───────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default memo(function GraphTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Infinite query — accumulates pages like VS Code ───────────────
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["git", "log-infinite", gitCwd] as const,
    queryFn: async ({ pageParam }) => {
      const api = ensureNativeApi();
      if (!gitCwd) throw new Error("Git log is unavailable.");
      return api.git.log({ cwd: gitCwd, skip: pageParam, maxCount: PAGE_SIZE });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, p) => sum + p.entries.length, 0);
    },
    enabled: gitCwd !== null,
    staleTime: 10_000,
  });

  // Flatten all accumulated pages into one continuous entries array
  const rawEntries = useMemo(
    () => data?.pages.flatMap((p) => p.entries) ?? [],
    [data?.pages],
  );

  // Filter out orphan root commits (e.g. t3 checkpoint snapshots) that are
  // not referenced as a parent by any other entry.  These produce
  // disconnected dots in the graph.  We keep genuine root commits (the very
  // first commit in a repo) because another entry will list them as a parent.
  const entries = useMemo(() => {
    const parentSet = new Set<string>();
    for (const e of rawEntries) {
      for (const p of e.parents) parentSet.add(p);
    }
    return rawEntries.filter((e) => e.parents.length > 0 || parentSet.has(e.sha));
  }, [rawEntries]);

  const viewModels = useMemo(() => toViewModelArray(entries), [entries]);
  const graph = useMemo(() => computeMonolithicGraph(viewModels), [viewModels]);
  const dedupedRefsMap = useMemo(
    () => new Map(entries.map((e) => [e.sha, deduplicateRefs(e.refs)])),
    [entries],
  );

  // ── Infinite scroll via IntersectionObserver ──────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: container, rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Mutations ─────────────────────────────────────────────────────
  const softResetMutation = useMutation(gitSoftResetMutationOptions({ cwd: gitCwd, queryClient }));
  const revertCommitMutation = useMutation(
    gitRevertCommitMutationOptions({ cwd: gitCwd, queryClient }),
  );

  // ── Context menu handlers ─────────────────────────────────────────
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
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
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

        {viewModels.length > 0 && (
          <div className="relative" style={{ minHeight: graph.height }}>
            {/* Single monolithic SVG — all graph paths in one coordinate space */}
            <svg
              className="scm-graph pointer-events-none absolute top-0 left-0"
              width={graph.width}
              height={graph.height}
              style={{ zIndex: 0, overflow: "visible" }}
            >
              {graph.paths.map((p) => (
                <path
                  key={p.d}
                  d={p.d}
                  fill="none"
                  strokeWidth={1}
                  strokeLinecap="round"
                  style={{ stroke: p.color }}
                />
              ))}
              {graph.circles.map(renderCircle)}
            </svg>

            {/* Commit rows overlaid on top */}
            {viewModels.map((vm) => (
              <CommitRow
                key={vm.entry.sha}
                vm={vm}
                graphWidth={graph.width}
                dedupedRefs={dedupedRefsMap.get(vm.entry.sha) ?? []}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel + loading indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-2">
            <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={sentinelRef} className="h-px" />
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
