# Git Management Panel — Full Implementation Plan

## Status: IN_PROGRESS
## Last Updated: 2026-03-27

## Goal

Replace the small "Commit & push" dropdown in ChatHeader with a comprehensive Git Management Panel — a right-side panel with 6 tabs (Changes, Graph, Branches, Worktrees, Stash, PRs) + a collapsible Activity Log. This makes T3 Code a self-contained git GUI.

## Context

The current git UI is `GitActionsControl` — a smart quick-action button with a 3-item dropdown (Commit, Push, View PR) in the ChatHeader. The user wants a VS Code-style source control experience with full branch management, stash CRUD, visual commit graph, worktree management, PR listing, and an activity/error log showing every git command executed.

**Design decisions made during brainstorming:**
- **Smart hybrid trigger**: The header button keeps its contextual label ("Commit & push", "Push", etc.) but clicking opens the panel pre-focused on Changes tab. Dropdown removed entirely.
- **Third right panel**: Same pattern as DiffPanel and FileEditorPanel (inline sidebar >1180px, sheet on mobile). Mutual exclusion — opening one closes the others.
- **6 tabs + activity log**: Changes, Graph, Branches, Worktrees, Stash, PRs. Activity log is a collapsible/resizable bottom section visible across ALL tabs.
- **Visual commit graph**: SVG-based branch/merge lines with colored lanes (not a simple flat list).
- **Full stash management**: List, create (with message + untracked toggle), apply, pop, drop (with confirmation), show diff.
- **Branch management**: Create/checkout/delete. Merge via PR only (no direct merge/rebase in UI).
- **Activity log**: Shows every git command with status (running/success/fail), duration, and expandable error output.

---

## Technical Approach

### Architecture

The panel follows the established T3 Code pattern:

```
packages/contracts/src/git.ts    → Effect Schema definitions (input/output types)
packages/contracts/src/ws.ts     → WS_METHODS constants + WebSocketRequestBody union
packages/contracts/src/ipc.ts    → NativeApi TypeScript interface
apps/server/src/git/Services/    → Effect service interfaces (GitCore, GitManager)
apps/server/src/git/Layers/      → Effect layer implementations
apps/server/src/wsServer.ts      → Route WS methods to service calls
apps/web/src/wsNativeApi.ts      → Client WS transport wiring
apps/web/src/lib/gitReactQuery.ts → React Query options factories
apps/web/src/components/GitPanel/ → React UI components
apps/web/src/gitPanelStore.ts    → Zustand state management
```

### New Server Endpoints Required

| Endpoint | Git Command | Phase |
|----------|-------------|-------|
| `git.statusDetailed` | `git status --porcelain=2 --branch` + `git diff --numstat` + `git diff --cached --numstat` | 2 |
| `git.stageFiles` | `git add -- <paths>` | 2 |
| `git.unstageFiles` | `git restore --staged -- <paths>` | 2 |
| `git.deleteBranch` | `git branch -d <branch>` (or `-D` if force) | 3 |
| `git.stashList` | `git stash list --format=...` | 4 |
| `git.stashCreate` | `git stash push -m <msg>` (optional `--include-untracked`) | 4 |
| `git.stashApply` | `git stash apply stash@{n}` | 4 |
| `git.stashPop` | `git stash pop stash@{n}` | 4 |
| `git.stashDrop` | `git stash drop stash@{n}` | 4 |
| `git.stashShow` | `git stash show -p stash@{n}` | 4 |
| `git.listWorktrees` | `git worktree list --porcelain` | 5 |
| `git.listPullRequests` | `gh pr list --json ...` | 5 |
| `git.log` | `git log --format=<structured> --parents --decorate=short` | 6 |

### Existing Endpoints Reused (no changes needed)

| Endpoint | Used In |
|----------|---------|
| `git.status` | Changes tab (fallback), panel badge |
| `git.listBranches` | Branches tab, branch pickers |
| `git.checkout` | Branches tab |
| `git.createBranch` | Branches tab |
| `git.createWorktree` | Worktrees tab |
| `git.removeWorktree` | Worktrees tab |
| `git.runStackedAction` | Changes tab (commit/push/PR) |
| `git.pull` | Changes tab pull action |
| `git.resolvePullRequest` | PRs tab |
| `git.preparePullRequestThread` | PRs tab checkout |

---

## Phase 1: Foundation — Panel Shell, Store, Tab UI

### Files to Create

#### `apps/web/src/gitPanelStore.ts`

Zustand store following `fileEditorStore.ts` pattern:

```typescript
import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GitPanelTab = "changes" | "graph" | "branches" | "worktrees" | "stash" | "prs";

export interface ActivityLogEntry {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  output: string;
  timestamp: number;
  durationMs?: number;
}

interface ThreadGitPanelState {
  open: boolean;
  activeTab: GitPanelTab;
  activityLogExpanded: boolean;
  commitMessage: string;
}

const GIT_PANEL_STATE_STORAGE_KEY = "t3code:git-panel-state:v1";

const DEFAULT_THREAD_STATE: ThreadGitPanelState = Object.freeze({
  open: false,
  activeTab: "changes" as GitPanelTab,
  activityLogExpanded: false,
  commitMessage: "",
});

// Store shape follows fileEditorStore: per-thread state + actions
// Activity log entries stored separately (not persisted — session-only)
interface GitPanelStoreState {
  stateByThreadId: Record<string, ThreadGitPanelState>;
  activityLog: ActivityLogEntry[];
  openPanel: (threadId: ThreadId, tab?: GitPanelTab) => void;
  closePanel: (threadId: ThreadId) => void;
  setActiveTab: (threadId: ThreadId, tab: GitPanelTab) => void;
  setCommitMessage: (threadId: ThreadId, message: string) => void;
  toggleActivityLog: (threadId: ThreadId) => void;
  addLogEntry: (entry: ActivityLogEntry) => void;
  updateLogEntry: (id: string, updates: Partial<ActivityLogEntry>) => void;
  clearLog: () => void;
  removeOrphanedStates: (activeThreadIds: Set<ThreadId>) => void;
}
```

Key implementation notes:
- `partialize` should only persist `stateByThreadId` (not `activityLog`)
- `openPanel` sets `open: true` and optionally `activeTab`
- Follow the `updateThread` helper pattern from `fileEditorStore`
- Clean up default states to avoid localStorage bloat (same `isDefaultState` pattern)

#### `apps/web/src/components/GitPanelShell.tsx`

Direct copy of `FileEditorPanelShell.tsx` pattern:

```typescript
export type GitPanelMode = "sheet" | "sidebar";

export function GitPanelShell(props: {
  mode: GitPanelMode;
  header: ReactNode;
  children: ReactNode;
}) {
  // Same electron drag-region handling as FileEditorPanelShell
  // mode "sheet" = no drag region, mode "sidebar" = drag region if electron
}
```

#### `apps/web/src/components/GitPanel.tsx`

Main panel component:

```typescript
// Default export for lazy loading
export default function GitPanel(props: { mode: GitPanelMode }) {
  const { threadId } = useParams(); // from TanStack Router
  const gitCwd = useActiveProjectGitCwd(); // reuse existing hook pattern
  const store = useGitPanelStore();
  const threadState = store.stateByThreadId[threadId] ?? DEFAULT;

  return (
    <GitPanelShell mode={props.mode} header={<TabBar ... />}>
      <div className="flex-1 overflow-hidden">
        {/* Active tab content */}
        <Suspense fallback={<TabSkeleton />}>
          {threadState.activeTab === "changes" && <ChangesTab ... />}
          {/* ... other tabs as placeholders initially */}
        </Suspense>
      </div>
      {/* Activity log at bottom */}
      <ActivityLog expanded={threadState.activityLogExpanded} ... />
    </GitPanelShell>
  );
}
```

Tab bar renders 6 tabs using either Base-UI Tabs or simple buttons with active state styling.

### Files to Modify

#### `apps/web/src/routes/_chat.$threadId.tsx`

Current right panel logic (from exploration):
- `diffOpen` state controls DiffPanel visibility
- `FileEditorPanel` open state comes from `useFileEditorStore`
- `RightPanelInlineSidebar` (desktop >1180px) and `RightPanelSheet` (mobile) render the active panel
- Mutual exclusion: opening editor closes diff and vice versa

Changes needed:
1. Import `useGitPanelStore` and read `gitPanelOpen` for current thread
2. Add `const LazyGitPanel = lazy(() => import("../components/GitPanel"))`
3. Extend `rightPanelContent` logic to include git panel as third option
4. In `openGitPanel` callback: close diff + close editor panel
5. In existing `openDiff`/`openEditor` callbacks: also close git panel
6. Render `LazyGitPanel` when `gitPanelOpen` is true

#### `apps/web/src/components/chat/ChatHeader.tsx`

The `GitActionsControl` is rendered here. No changes to ChatHeader itself — the changes happen inside GitActionsControl.

#### `apps/web/src/components/GitActionsControl.tsx`

This is a large (38KB) component. For Phase 1:
- Remove the dropdown `Menu` wrapper
- Keep the smart quick-action button (with contextual label)
- On click: call `gitPanelStore.openPanel(threadId, "changes")` instead of opening dialogs
- Remove the commit dialog, push dialog, PR dialog code (moves to panel tabs later)
- Keep the progress tracking toast (it still works independently)

**Important**: This is a significant refactor. The commit/push logic needs to be extracted into shared utilities that both the old `GitActionsControl` and new `ChangesTab` can use. For Phase 1, we can just wire the button to open the panel and keep the dialogs temporarily until Phase 2 replaces them.

---

## Phase 2: Changes Tab — Detailed Status + Stage/Unstage

### New Contracts

#### `packages/contracts/src/git.ts` additions

```typescript
// Status with staged vs unstaged separation
export const GitFileStatus = Schema.Literal(
  "modified", "added", "deleted", "renamed", "copied", "typechange", "unmerged"
);

export const GitStatusDetailedFile = Struct({
  path: Schema.String,
  status: GitFileStatus,
  insertions: Schema.Number,
  deletions: Schema.Number,
  oldPath: Schema.optional(Schema.String), // for renames
});

export const GitStatusDetailedInput = Struct({ cwd: Schema.String });

export const GitStatusDetailedResult = Struct({
  branch: Schema.NullOr(Schema.String),
  staged: Schema.Array(GitStatusDetailedFile),
  unstaged: Schema.Array(GitStatusDetailedFile),
  untracked: Schema.Array(Struct({ path: Schema.String })),
  hasUpstream: Schema.Boolean,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitOpenPullRequest), // reuse existing schema
});

export const GitStageFilesInput = Struct({
  cwd: Schema.String,
  filePaths: Schema.NonEmptyArray(Schema.String),
});

export const GitUnstageFilesInput = Struct({
  cwd: Schema.String,
  filePaths: Schema.NonEmptyArray(Schema.String),
});
```

#### `packages/contracts/src/ws.ts` additions

```typescript
// In WS_METHODS:
gitStatusDetailed: "git.statusDetailed",
gitStageFiles: "git.stageFiles",
gitUnstageFiles: "git.unstageFiles",

// In WebSocketRequestBody tagged union:
// Add new variants for each method
```

### Server Implementation

#### `apps/server/src/git/Layers/GitCore.ts` — `statusDetailed`

Parse `git status --porcelain=2 --branch`:
- Lines starting with `1` = tracked changed files (XY field distinguishes staged vs unstaged)
- Lines starting with `2` = renamed/copied files
- Lines starting with `?` = untracked files
- Lines starting with `u` = unmerged files
- `# branch.head` = current branch name
- `# branch.ab` = ahead/behind counts

Combine with:
- `git diff --numstat` for unstaged insertions/deletions
- `git diff --cached --numstat` for staged insertions/deletions

The XY two-character status field from porcelain v2:
- First char (X) = staged status
- Second char (Y) = unstaged status
- `.` = not modified, `M` = modified, `A` = added, `D` = deleted, `R` = renamed, `C` = copied

#### `apps/server/src/git/Layers/GitCore.ts` — `stageFiles` / `unstageFiles`

Simple commands:
```
git add -- path1 path2 path3
git restore --staged -- path1 path2 path3
```

### Client UI

#### `apps/web/src/components/GitPanel/ChangesTab.tsx`

Layout:
```
┌─────────────────────────────────┐
│ [Commit message textarea]       │
│ [Commit] [Commit & Push] [C+P+PR]│
├─────────────────────────────────┤
│ STAGED (N)        [Unstage All] │
│  M src/foo.tsx    +12 −3    [−] │
│  A src/bar.ts     +45 −0    [−] │
├─────────────────────────────────┤
│ CHANGES (N)        [Stage All]  │
│  M src/baz.tsx    +5  −1    [+] │
├─────────────────────────────────┤
│ UNTRACKED (N)      [Stage All]  │
│  ? src/new.ts                [+] │
└─────────────────────────────────┘
```

Key implementation:
- Uses `gitStatusDetailedQueryOptions` with 3s stale time, 10s refetch interval
- Commit message stored in `gitPanelStore` (persisted per-thread)
- Action buttons reuse `gitRunStackedActionMutationOptions` from existing `projectReactQuery.ts`
- The `filePaths` param on `GitRunStackedActionInput` already supports selective commit — pass staged file paths
- Stage/unstage mutations invalidate `gitQueryKeys.all` to refresh status
- Click file → open in FileEditorPanel or view diff

---

## Phase 3: Branches Tab + Activity Log

### BranchesTab

Uses existing `gitBranchesQueryOptions` — the `GitBranch` type already has:
- `name`, `isHead` (current), `isDefault`, `upstream`, `worktreePath`
- Remote branches included

Layout:
```
┌─────────────────────────────────┐
│ [Search branches...]            │
│ [+ Create Branch]               │
├─────────────────────────────────┤
│ LOCAL                           │
│  ● main (current)     ↑0 ↓0    │
│  ○ feature/editor     ↑1 ↓3  ⋯ │
├─────────────────────────────────┤
│ ▸ REMOTE (origin)               │
│  ○ origin/main                  │
│  ○ origin/staging               │
└─────────────────────────────────┘
```

Context menu (⋯ button or right-click):
- Checkout → `api.git.checkout({ cwd, branch })`
- Delete → confirmation dialog → `api.git.deleteBranch({ cwd, branch })`
- Create PR → open stacked action with `commit_push_pr`
- Push → existing push flow

Create Branch dialog:
- Branch name input (sanitized via `sanitizeBranchFragment` from `@t3tools/shared/git`)
- Base branch picker (dropdown of local branches, default: current)
- Uses `api.git.createBranch({ cwd, branch, baseBranch })`

### ActivityLog

Subscribes to `api.git.onActionProgress` (existing callback in `wsNativeApi.ts`).

Translates `GitActionProgressEvent` union types into log entries:
- `action_started` → new entry with status "running"
- `phase_started` → update entry with phase label
- `hook_output` → append to entry output
- `action_finished` → mark success
- `action_failed` → mark error with message

Also hooks into mutations' `onMutate`/`onSuccess`/`onError` to log non-action commands (stage, unstage, checkout, delete branch, etc.).

### New Contract: `git.deleteBranch`

```typescript
export const GitDeleteBranchInput = Struct({
  cwd: Schema.String,
  branch: TrimmedNonEmptyString,
  force: Schema.optional(Schema.Boolean),
});
```

Server: `git branch -d <branch>` (or `-D` if `force: true`)

---

## Phase 4: Stash Tab

### New Contracts

```typescript
export const GitStashEntry = Struct({
  index: NonNegativeInt,
  message: Schema.String,
  branch: Schema.NullOr(Schema.String),
  date: Schema.String, // ISO 8601
});

export const GitStashListInput = Struct({ cwd: Schema.String });
export const GitStashListResult = Struct({ entries: Schema.Array(GitStashEntry) });

export const GitStashCreateInput = Struct({
  cwd: Schema.String,
  message: Schema.optional(TrimmedNonEmptyString),
  includeUntracked: Schema.optional(Schema.Boolean),
});

export const GitStashApplyInput = Struct({
  cwd: Schema.String,
  index: NonNegativeInt,
});

export const GitStashPopInput = Struct({
  cwd: Schema.String,
  index: NonNegativeInt,
});

export const GitStashDropInput = Struct({
  cwd: Schema.String,
  index: NonNegativeInt,
});

export const GitStashShowInput = Struct({
  cwd: Schema.String,
  index: NonNegativeInt,
});

export const GitStashShowResult = Struct({
  diff: Schema.String, // raw diff output
  files: Schema.Array(Struct({
    path: Schema.String,
    insertions: Schema.Number,
    deletions: Schema.Number,
  })),
});
```

### Server Implementation

- `stashList`: `git stash list --format='%gd|||%gs|||%ci'` → parse into `GitStashEntry[]`
- `stashCreate`: `git stash push -m "<message>"` + optional `--include-untracked`
- `stashApply`: `git stash apply stash@{<index>}`
- `stashPop`: `git stash pop stash@{<index>}`
- `stashDrop`: `git stash drop stash@{<index>}`
- `stashShow`: `git stash show -p --numstat stash@{<index>}` → parse into diff + file stats

---

## Phase 5: Worktrees Tab + PRs Tab

### Worktrees

New endpoint `git.listWorktrees`:
- Server: `git worktree list --porcelain` → parse into `[{ path, head, branch, isBare }]`
- Reuses existing `git.createWorktree` and `git.removeWorktree`

### Pull Requests

New endpoint `git.listPullRequests`:
- Server: `gh pr list --state <state> --json number,title,url,state,baseRefName,headRefName,author,createdAt --limit 50`
- Uses existing `GitHubCli` service (already has `resolvePullRequest` pattern)
- Filter by state: "open" (default), "closed", "all"

---

## Phase 6: Graph Tab — SVG Commit Visualization

### New Contract

```typescript
export const GitLogInput = Struct({
  cwd: Schema.String,
  maxCount: Schema.optional(NonNegativeInt), // default 50
  skip: Schema.optional(NonNegativeInt),
  branch: Schema.optional(Schema.String), // default --all
});

export const GitLogEntry = Struct({
  sha: Schema.String,
  shortSha: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
  authorDate: Schema.String, // ISO 8601
  subject: Schema.String,
  parents: Schema.Array(Schema.String), // parent SHAs
  refs: Schema.Array(Schema.String), // branch/tag labels
});

export const GitLogResult = Struct({
  entries: Schema.Array(GitLogEntry),
  hasMore: Schema.Boolean,
});
```

### Server

`git log --format='%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P%x00%D' --max-count=N --skip=S --all`

Where `%x00` is null byte separator for reliable parsing:
- `%H` = full SHA, `%h` = short SHA
- `%an` = author name, `%ae` = author email
- `%aI` = author date ISO, `%s` = subject
- `%P` = parent SHAs (space-separated)
- `%D` = ref names (comma-separated)

### Graph Layout Algorithm (`graphLayout.ts`)

Pure function, no React dependency. Input: `GitLogEntry[]` (topologically sorted). Output: node positions + edge paths.

Algorithm (standard lane assignment):
1. Maintain an array of "active lanes" (each lane holds the SHA it's waiting to connect to)
2. For each commit:
   - Find its lane (where a child placed it) or assign a new lane
   - For each parent:
     - First parent: continues the current lane
     - Other parents: find or create lanes for them
   - Free any lane that has no more pending connections
3. Output: each commit gets `(column, row)`, each edge gets SVG path data

Edge rendering:
- Straight vertical lines for same-lane connections
- Bezier curves for cross-lane connections (merge lines)
- Each lane gets a consistent color from a palette

### GraphTab Component

- Virtualized scrolling (can use `@tanstack/react-virtual` or simple windowed rendering)
- Left column: SVG canvas for graph lines (positioned absolute, width = numLanes * laneWidth)
- Right column: commit details (message, author, date, ref badges)
- "Load more" pagination at bottom (fetch next 50 with `skip` param)

---

## Phase 7: Polish + Migration

### GitActionsControl Slim-Down

The 38KB `GitActionsControl.tsx` gets dramatically simplified:
- Remove: `CommitDialog`, `PushDialog`, file selection logic, all dialog state
- Keep: Smart quick-action button with contextual label
- Change: Button click → `gitPanelStore.openPanel(threadId, "changes")`
- Keep: Progress tracking toast (works independently via WS subscription)

### Activity Log Enhancement

- Intercept ALL git mutations (not just stacked actions) by wrapping `api.git.*` calls
- Show: command name, file paths (truncated), status, duration, error output
- Error output expandable with monospace styling

### Keyboard Shortcuts

- `Cmd+Shift+G` (Mac) / `Ctrl+Shift+G` (Win) → toggle Git panel
- When panel focused: `1-6` keys switch tabs

---

## Integration Points

### How panel integrates with existing panels

In `_chat.$threadId.tsx`, the current logic:
```typescript
// Existing:
const diffOpen = useDiffStore().open;
const editorOpen = useFileEditorStore().stateByThreadId[threadId]?.open;

// New:
const gitPanelOpen = useGitPanelStore().stateByThreadId[threadId]?.open;

// Right panel content priority:
// 1. Git panel (if open)
// 2. Editor panel (if open)
// 3. Diff panel (if open)
// Mutual exclusion: opening one closes the others
```

### How Changes tab reuses existing commit logic

The existing `GitActionsControl.logic.ts` has:
- `resolveQuickAction()` — determines the smart action label
- `resolveMenuItems()` — determines which actions are available

The Changes tab will import and reuse these functions. The actual commit execution uses `gitRunStackedActionMutationOptions` which is already in `projectReactQuery.ts`.

### How the store communicates with ChatHeader

The `GitActionsControl` in the header reads from `useGitPanelStore` to know if the panel is open (for active state styling on the button). When the user clicks the button, it toggles the panel.

---

## Configuration

No new env vars or feature flags needed. The Git panel is always available when the project has a git CWD (same condition as the current `GitActionsControl`).

---

## Decisions Made

1. **Smart hybrid trigger** over separate panel button — keeps the header clean, one button serves dual purpose (label = status indicator, click = open panel).
2. **Third right panel** over dedicated page — stays in the chat context, consistent with existing panel architecture.
3. **Full 6 tabs** — user explicitly chose the maximal feature set.
4. **Visual graph with SVG lines** over simple flat list — user specifically wanted GitLens-style visualization.
5. **Full stash management** over basic — user wants create, apply, pop, drop, show diff.
6. **Branch management via create/checkout/delete + PR for merge** — no direct merge/rebase operations (safer, aligns with GitHub workflow).
7. **Collapsible activity log at bottom** over 7th tab — always accessible, doesn't require tab switching to see errors.
8. **`statusDetailed` as new endpoint** rather than modifying existing `status` — avoids breaking the existing `GitActionsControl` during migration.
