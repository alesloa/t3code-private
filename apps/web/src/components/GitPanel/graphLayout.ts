import type { GitLogEntry } from "@t3tools/contracts";

// ── VS Code graph constants (from scmHistory.ts) ─────────────────────

export const SWIMLANE_HEIGHT = 22;
export const SWIMLANE_WIDTH = 11;
export const SWIMLANE_CURVE_RADIUS = 5;
export const CIRCLE_RADIUS = 4;
export const CIRCLE_STROKE_WIDTH = 2;

/** VS Code's default branch color (charts.blue → editorInfo.foreground) */
export const GRAPH_REF_COLOR = "#59a4f9";

/** VS Code's 5-color rotation for additional swimlanes */
export const GRAPH_COLORS = ["#FFB000", "#DC267F", "#994F00", "#40B0A6", "#B66DFF"] as const;

// ── Types ────────────────────────────────────────────────────────────

export interface SwimlaneNode {
  id: string;
  color: string;
}

export type CommitKind = "HEAD" | "node";

export interface HistoryItemViewModel {
  entry: GitLogEntry;
  inputSwimlanes: SwimlaneNode[];
  outputSwimlanes: SwimlaneNode[];
  kind: CommitKind;
}

// ── Helpers ──────────────────────────────────────────────────────────

function rot(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function findLastSwimlaneIndex(nodes: readonly SwimlaneNode[], id: string): number {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i]!.id === id) return i;
  }
  return -1;
}

// ── Swimlane algorithm ───────────────────────────────────────────────
// Ported from VS Code's toISCMHistoryItemViewModelArray (scmHistory.ts)
//
// Each row has inputSwimlanes (state entering from above) and
// outputSwimlanes (state leaving below). The rendering function uses
// these to draw vertical pass-through lines, merge-back curves, fork
// curves, and lane-shift S-curves.

export function toViewModelArray(entries: readonly GitLogEntry[]): HistoryItemViewModel[] {
  let colorIndex = -1;
  const viewModels: HistoryItemViewModel[] = [];

  for (const entry of entries) {
    const isHead = entry.refs.some((r) => r === "HEAD" || r.startsWith("HEAD -> "));
    const kind: CommitKind = isHead ? "HEAD" : "node";

    const previousOutput = viewModels.at(-1)?.outputSwimlanes ?? [];
    const inputSwimlanes = previousOutput.map((n) => Object.assign({}, n));
    const outputSwimlanes: SwimlaneNode[] = [];

    let firstParentAdded = false;

    if (entry.parents.length > 0) {
      // Replace commit's lane with first parent; pass through others
      for (const node of inputSwimlanes) {
        if (node.id === entry.sha) {
          if (!firstParentAdded) {
            // VS Code: getLabelColorIdentifier() returns historyItemRefColor
            // (blue) for the HEAD commit, otherwise inherits the lane color.
            const laneColor = kind === "HEAD" ? GRAPH_REF_COLOR : node.color;
            outputSwimlanes.push({
              id: entry.parents[0]!,
              color: laneColor,
            });
            firstParentAdded = true;
          }
          continue;
        }
        outputSwimlanes.push({ ...node });
      }
    } else {
      // Root commit: consume commit's lane, pass through others
      for (const node of inputSwimlanes) {
        if (node.id === entry.sha) continue;
        outputSwimlanes.push({ ...node });
      }
    }

    // Add remaining parent(s) as new swimlanes
    for (let i = firstParentAdded ? 1 : 0; i < entry.parents.length; i++) {
      // First parent of HEAD commit gets blue; everything else rotates
      let color: string;
      if (i === 0 && kind === "HEAD") {
        color = GRAPH_REF_COLOR;
      } else {
        colorIndex = rot(colorIndex + 1, GRAPH_COLORS.length);
        color = GRAPH_COLORS[colorIndex]!;
      }
      outputSwimlanes.push({ id: entry.parents[i]!, color });
    }

    viewModels.push({ entry, kind, inputSwimlanes, outputSwimlanes });
  }

  return viewModels;
}

/** Compute circle position (swimlane index) and color for a row */
export function getCircleInfo(vm: HistoryItemViewModel): {
  index: number;
  color: string;
} {
  const inputIndex = vm.inputSwimlanes.findIndex((n) => n.id === vm.entry.sha);
  const circleIndex = inputIndex !== -1 ? inputIndex : vm.inputSwimlanes.length;

  const color =
    circleIndex < vm.outputSwimlanes.length
      ? vm.outputSwimlanes[circleIndex]!.color
      : circleIndex < vm.inputSwimlanes.length
        ? vm.inputSwimlanes[circleIndex]!.color
        : GRAPH_REF_COLOR;

  return { index: circleIndex, color };
}
