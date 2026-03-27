import { type ThreadId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { gitLogQueryOptions } from "~/lib/gitReactQuery";
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
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (diff < MONTH) {
    const w = Math.floor(diff / WEEK);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (diff < YEAR) {
    const mo = Math.floor(diff / MONTH);
    return `${mo} month${mo === 1 ? "" : "s"} ago`;
  }
  const y = Math.floor(diff / YEAR);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

// ── Ref badge ─────────────────────────────────────────────────────────

function RefBadge({ name }: { name: string }) {
  const isHead = name.startsWith("HEAD");
  const isTag = name.startsWith("tag: ");
  const label = isTag ? name.slice(5) : name;
  const bg = isHead
    ? "bg-amber-500/20 text-amber-300"
    : isTag
      ? "bg-purple-500/20 text-purple-300"
      : "bg-blue-500/20 text-blue-300";

  return (
    <span
      className={`mr-1 inline-block max-w-[120px] truncate rounded px-1 py-px font-mono text-[10px] leading-tight ${bg}`}
    >
      {label}
    </span>
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

  const { data, isLoading, isError } = useQuery(
    gitLogQueryOptions(gitCwd, { skip, maxCount: PAGE_SIZE }),
  );

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const hasMore = data?.hasMore ?? false;

  const layout = useMemo(() => computeGraphLayout(entries), [entries]);

  const svgWidth = LANE_WIDTH * (layout.maxColumns + 2);
  const svgHeight = entries.length * ROW_HEIGHT;

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
                  key={`${edge.fromSha}-${edge.toSha}`}
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
              <div
                key={entry.sha}
                className="flex items-center text-xs hover:bg-accent/30"
                style={{
                  height: ROW_HEIGHT,
                  paddingLeft: svgWidth + 4,
                  position: "relative",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {entry.refs.length > 0 &&
                      entry.refs.map((ref) => <RefBadge key={`${entry.sha}-${ref}`} name={ref} />)}
                    <span className="truncate" title={entry.subject}>
                      {entry.subject}
                    </span>
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-2 pr-3 text-[10px] text-muted-foreground">
                  <span className="w-[60px] truncate text-right font-mono" title={entry.sha}>
                    {entry.shortSha}
                  </span>
                  <span className="w-[80px] truncate text-right">
                    {relativeTime(entry.authorDate)}
                  </span>
                </div>
              </div>
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
    </div>
  );
});
