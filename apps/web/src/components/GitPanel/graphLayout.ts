import type { GitLogEntry } from "@t3tools/contracts";

export interface GraphNode {
  sha: string;
  column: number;
  row: number;
  color: string;
}

export interface GraphEdge {
  fromSha: string;
  toSha: string;
  pathData: string; // SVG path "d" attribute
  color: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxColumns: number;
}

const LANE_COLORS = [
  "#4ea6f5",
  "#e5534b",
  "#57ab5a",
  "#c69026",
  "#986ee2",
  "#d08770",
  "#6cb6ff",
  "#adbac7",
  "#f47067",
  "#8ddb8c",
];

export const ROW_HEIGHT = 28;
export const LANE_WIDTH = 16;
export const NODE_RADIUS = 4;

function laneColor(column: number): string {
  return LANE_COLORS[column % LANE_COLORS.length]!;
}

function laneX(column: number): number {
  return LANE_WIDTH + column * LANE_WIDTH;
}

function rowY(row: number): number {
  return ROW_HEIGHT / 2 + row * ROW_HEIGHT;
}

/**
 * Compute graph layout (node positions + edge SVG paths) from a linear
 * list of git log entries ordered newest-first (topological order).
 *
 * Algorithm based on git's graph.c lane assignment:
 * - Lanes track which SHA they are "waiting for"
 * - A commit claims the leftmost lane that expects it
 * - ALL lanes pointing to a merge target get freed (not just one)
 * - First parent continues the commit's lane (straight down)
 * - Additional parents fork into new lanes to the right
 * - Edges use vertical-then-curve for merge-back, curve-then-vertical for fork
 */
export function computeGraphLayout(entries: readonly GitLogEntry[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Map SHA -> row index for lookup during edge generation
  const shaToRow = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    shaToRow.set(entries[i]!.sha, i);
  }

  // Active lanes: each slot holds the SHA that lane is waiting for, or null if free
  const lanes: (string | null)[] = [];

  // Track which column each commit is assigned to
  const shaToColumn = new Map<string, number>();

  // Track the color assigned to each lane column
  const laneColorMap = new Map<number, string>();
  let nextColorIdx = 0;

  function assignLaneColor(col: number): string {
    const existing = laneColorMap.get(col);
    if (existing) return existing;
    const color = LANE_COLORS[nextColorIdx % LANE_COLORS.length]!;
    nextColorIdx++;
    laneColorMap.set(col, color);
    return color;
  }

  let maxColumns = 0;

  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row]!;
    const { sha, parents } = entry;

    // ── STEP 1: Find ALL lanes expecting this commit ──
    const matchingLanes: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === sha) {
        matchingLanes.push(i);
      }
    }

    // Commit occupies the leftmost matching lane (keeps graph compact)
    let col: number;
    if (matchingLanes.length > 0) {
      col = matchingLanes[0]!; // already leftmost since we scan left-to-right
    } else {
      // No lane expects this commit — it's a new branch head
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }

    shaToColumn.set(sha, col);
    const color = assignLaneColor(col);
    nodes.push({ sha, column: col, row, color });

    if (maxColumns < lanes.length) maxColumns = lanes.length;

    // ── STEP 2: Free ALL matching lanes ──
    // Every lane pointing to this SHA is now resolved.
    for (const laneIdx of matchingLanes) {
      lanes[laneIdx] = null;
    }

    // ── STEP 3: Assign parents to lanes ──
    if (parents.length >= 1) {
      const firstParent = parents[0]!;
      // First parent continues THIS lane (straight down)
      lanes[col] = firstParent;

      // Additional parents: each gets a lane
      for (let p = 1; p < parents.length; p++) {
        const parentSha = parents[p]!;

        // Check if another lane already expects this parent
        let alreadyTracked = false;
        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i] === parentSha) {
            alreadyTracked = true;
            break;
          }
        }
        if (alreadyTracked) continue;

        // Find a free lane, preferring slots to the RIGHT of current column
        // to create the visual fork effect
        let freeLane = -1;
        for (let i = col + 1; i < lanes.length; i++) {
          if (lanes[i] === null) {
            freeLane = i;
            break;
          }
        }
        if (freeLane === -1) {
          freeLane = lanes.length;
          lanes.push(null);
        }
        lanes[freeLane] = parentSha;
        assignLaneColor(freeLane);
      }
    }

    if (maxColumns < lanes.length) maxColumns = lanes.length;

    // ── STEP 4: Compact trailing nulls ──
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }
  }

  // ── Edge generation ──
  // Now that all commits have column assignments, draw edges from
  // each commit to its parents with proper routing.
  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row]!;
    const fromCol = shaToColumn.get(entry.sha)!;
    const fromX = laneX(fromCol);
    const fromY = rowY(row);

    for (let p = 0; p < entry.parents.length; p++) {
      const parentSha = entry.parents[p]!;
      const parentRow = shaToRow.get(parentSha);

      if (parentRow === undefined) {
        // Parent not in visible entries — draw line to bottom edge
        const toX = p === 0 ? fromX : laneX(fromCol + 1);
        const toY = rowY(entries.length - 1) + ROW_HEIGHT;
        const edgeColor = laneColorMap.get(fromCol) ?? laneColor(fromCol);
        edges.push({
          fromSha: entry.sha,
          toSha: parentSha,
          pathData: `M ${fromX} ${fromY} L ${toX} ${toY}`,
          color: edgeColor,
        });
        continue;
      }

      const toCol = shaToColumn.get(parentSha)!;
      const toX = laneX(toCol);
      const toY = rowY(parentRow);

      if (fromCol === toCol) {
        // Same lane: straight vertical line
        const edgeColor = laneColorMap.get(fromCol) ?? laneColor(fromCol);
        edges.push({
          fromSha: entry.sha,
          toSha: parentSha,
          pathData: `M ${fromX} ${fromY} L ${toX} ${toY}`,
          color: edgeColor,
        });
      } else if (p === 0) {
        // First parent in a different column: MERGE-BACK
        // The commit was on a side branch, now merging back to the parent's lane.
        // Visual: vertical drop in fromCol, then curve into toCol
        const bendY = toY - ROW_HEIGHT * 0.5;
        const edgeColor = laneColorMap.get(fromCol) ?? laneColor(fromCol);
        edges.push({
          fromSha: entry.sha,
          toSha: parentSha,
          pathData: `M ${fromX} ${fromY} L ${fromX} ${bendY} C ${fromX} ${toY}, ${toX} ${bendY}, ${toX} ${toY}`,
          color: edgeColor,
        });
      } else {
        // Non-first parent: FORK/DIVERGENCE
        // A merge commit pulling in a side branch.
        // Visual: curve out from fromCol, then vertical drop in toCol
        const bendY = fromY + ROW_HEIGHT * 0.5;
        const edgeColor = laneColorMap.get(toCol) ?? laneColor(toCol);
        edges.push({
          fromSha: entry.sha,
          toSha: parentSha,
          pathData: `M ${fromX} ${fromY} C ${fromX} ${bendY}, ${toX} ${bendY}, ${toX} ${fromY + ROW_HEIGHT} L ${toX} ${toY}`,
          color: edgeColor,
        });
      }
    }
  }

  return { nodes, edges, maxColumns: Math.max(maxColumns, 1) };
}
