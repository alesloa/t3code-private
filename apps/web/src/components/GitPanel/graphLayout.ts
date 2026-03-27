import type { GitLogEntry } from "@t3tools/contracts";

export interface GraphNode {
  sha: string;
  column: number;
  row: number;
  color: string;
}

export interface GraphEdge {
  id: string;
  fromSha: string;
  toSha: string;
  pathData: string;
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

function laneX(column: number): number {
  return LANE_WIDTH + column * LANE_WIDTH;
}

function rowY(row: number): number {
  return ROW_HEIGHT / 2 + row * ROW_HEIGHT;
}

/**
 * Row-by-row graph layout algorithm.
 *
 * Instead of drawing long edges between distant commits, this algorithm
 * processes each row and draws:
 * 1. Continuation lines for active lanes passing through the row
 * 2. Fork curves when a merge commit creates new branch lanes
 * 3. Merge-back curves when multiple lanes converge to a single commit
 *
 * This produces the "railroad track" visual where branch lines are
 * continuous and clearly show where they diverge and converge.
 */
export function computeGraphLayout(entries: readonly GitLogEntry[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeId = 0;

  // lanes[i] = SHA this lane is waiting for, or null if free
  // laneColors[i] = color assigned to this lane
  let lanes: (string | null)[] = [];
  let laneColors: (string | null)[] = [];
  let nextColorIdx = 0;

  const shaToRow = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    shaToRow.set(entries[i]!.sha, i);
  }

  // Track which row each SHA was placed in and which column it occupied,
  // so we can draw direct edges to already-processed parents.
  const shaToNode = new Map<string, { row: number; column: number }>();

  function assignColor(): string {
    const c = LANE_COLORS[nextColorIdx % LANE_COLORS.length]!;
    nextColorIdx++;
    return c;
  }

  function pushEdge(edge: Omit<GraphEdge, "id">): void {
    edges.push({ ...edge, id: `e${edgeId++}` });
  }

  let maxColumns = 0;

  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row]!;
    const { sha, parents } = entry;

    // ── Find all lanes expecting this commit ──
    const matchingLanes: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === sha) matchingLanes.push(i);
    }

    // Commit takes the leftmost matching lane, or a new one
    let col: number;
    if (matchingLanes.length > 0) {
      col = matchingLanes[0]!;
    } else {
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
        laneColors.push(null);
      }
      if (!laneColors[col]) laneColors[col] = assignColor();
    }

    const commitColor = laneColors[col]!;
    nodes.push({ sha, column: col, row, color: commitColor });
    shaToNode.set(sha, { row, column: col });

    // ── Draw merge-back edges for extra matching lanes ──
    // These are branches that were converging to this commit.
    // Draw a curve from their lane to this commit's lane.
    for (const laneIdx of matchingLanes) {
      if (laneIdx === col) continue;
      // Merge-back: curve from laneIdx into col at this row
      const fromX = laneX(laneIdx);
      const toX = laneX(col);
      const prevY = rowY(row - 1);
      const curY = rowY(row);
      const midY = (prevY + curY) / 2;
      const edgeColor = laneColors[laneIdx] ?? commitColor;
      pushEdge({
        fromSha: sha,
        toSha: sha,
        pathData: `M ${fromX} ${prevY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${curY}`,
        color: edgeColor,
      });
    }

    // ── Build the next row's lane state ──
    // Save the pre-mutation state for drawing continuation lines
    const prevLanes = lanes.slice();
    const prevColors = laneColors.slice();

    // Free all matching lanes
    for (const idx of matchingLanes) {
      lanes[idx] = null;
      // Don't clear color for col itself
      if (idx !== col) laneColors[idx] = null;
    }

    // First parent continues this lane (unless already processed)
    if (parents.length >= 1) {
      const firstParentNode = shaToNode.get(parents[0]!);
      if (firstParentNode != null) {
        // First parent was already rendered above — draw a direct edge
        // and leave this lane free.
        const fromX = laneX(col);
        const toX = laneX(firstParentNode.column);
        const fromY = rowY(row);
        const toY = rowY(firstParentNode.row);
        const midY = (fromY + toY) / 2;
        pushEdge({
          fromSha: sha,
          toSha: parents[0]!,
          pathData: `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`,
          color: commitColor,
        });
      } else {
        lanes[col] = parents[0]!;
      }
    }

    // Additional parents: create new branch lanes (or draw direct edges
    // to parents that were already processed in earlier rows).
    const newForkLanes: number[] = [];
    const directParentEdges: { pRow: number; pCol: number; color: string }[] = [];
    for (let p = 1; p < parents.length; p++) {
      const pSha = parents[p]!;

      // If the parent was already processed (e.g. branch tip appeared before
      // this merge in --all output), don't create a lane — it would never
      // resolve. Instead, record a direct edge to the parent's node.
      const parentNode = shaToNode.get(pSha);
      if (parentNode != null) {
        const color = assignColor();
        directParentEdges.push({ pRow: parentNode.row, pCol: parentNode.column, color });
        continue;
      }

      // Check if already tracked in an active lane
      if (lanes.includes(pSha)) continue;

      // Find free lane to the right
      let free = -1;
      for (let i = col + 1; i < lanes.length; i++) {
        if (lanes[i] === null) {
          free = i;
          break;
        }
      }
      if (free === -1) {
        free = lanes.length;
        lanes.push(null);
        laneColors.push(null);
      }
      lanes[free] = pSha;
      laneColors[free] = assignColor();
      newForkLanes.push(free);
    }

    // Draw fork edges: curve from commit's column out to the new lane
    for (const forkLane of newForkLanes) {
      const fromX = laneX(col);
      const toX = laneX(forkLane);
      const curY = rowY(row);
      const nextY = rowY(row + 1);
      const midY = (curY + nextY) / 2;
      const edgeColor = laneColors[forkLane]!;
      pushEdge({
        fromSha: sha,
        toSha: sha,
        pathData: `M ${fromX} ${curY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${nextY}`,
        color: edgeColor,
      });
    }

    // Draw direct edges to already-processed parents (upward curves).
    // These appear when --all causes a branch tip to be listed before the
    // merge commit that references it.
    for (const { pRow, pCol, color } of directParentEdges) {
      const fromX = laneX(col);
      const toX = laneX(pCol);
      const fromY = rowY(row);
      const toY = rowY(pRow);
      const midY = (fromY + toY) / 2;
      pushEdge({
        fromSha: sha,
        toSha: entries[pRow]!.sha,
        pathData: `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`,
        color,
      });
    }

    // ── Draw continuation lines for all active lanes ──
    // Any lane that was active before this row AND is still active after,
    // gets a vertical line segment through this row.
    // But skip the commit's own column (it has a node dot instead) and
    // skip lanes that just merged in (they got a curve above).
    const mergedSet = new Set(matchingLanes);
    const forkedSet = new Set(newForkLanes);

    for (let i = 0; i < Math.max(prevLanes.length, lanes.length); i++) {
      const wasBefore = prevLanes[i] !== null && prevLanes[i] !== undefined;
      const isAfter = lanes[i] !== null && lanes[i] !== undefined;

      if (i === col) {
        // Commit's lane: draw from top of row to the node, and from node to bottom
        // if the lane continues
        if (wasBefore && !mergedSet.has(i)) {
          // Nothing special needed for continuation — handled by prev row
        }
        // If lane continues after (has a parent), the next row will draw the top segment
        continue;
      }

      if (mergedSet.has(i)) {
        // This lane merged into the commit — curve was drawn above, don't draw vertical
        continue;
      }

      if (forkedSet.has(i)) {
        // This lane was just forked — curve was drawn above, don't draw vertical
        continue;
      }

      // Pass-through lane: draw vertical line through this row
      if (wasBefore && isAfter) {
        const x = laneX(i);
        const topY = rowY(row - 1);
        const botY = rowY(row);
        const color = prevColors[i] ?? laneColors[i] ?? LANE_COLORS[0]!;
        pushEdge({
          fromSha: `pass-${row}-${i}`,
          toSha: `pass-${row}-${i}`,
          pathData: `M ${x} ${topY} L ${x} ${botY}`,
          color,
        });
      }
    }

    // Draw the commit's own lane continuation (above and below the node)
    if (row > 0 && matchingLanes.includes(col)) {
      // Lane was active before → draw line from previous row to this node
      const x = laneX(col);
      const topY = rowY(row - 1);
      const botY = rowY(row);
      pushEdge({
        fromSha: `cont-above-${row}`,
        toSha: sha,
        pathData: `M ${x} ${topY} L ${x} ${botY}`,
        color: commitColor,
      });
    }

    if (lanes[col] !== null) {
      // Lane continues below → draw line from this node to next row
      const x = laneX(col);
      const topY = rowY(row);
      const botY = rowY(row + 1);
      pushEdge({
        fromSha: sha,
        toSha: `cont-below-${row}`,
        pathData: `M ${x} ${topY} L ${x} ${botY}`,
        color: commitColor,
      });
    }

    if (lanes.length > maxColumns) maxColumns = lanes.length;

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
      laneColors.pop();
    }
  }

  return { nodes, edges, maxColumns: Math.max(maxColumns, 1) };
}
