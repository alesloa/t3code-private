# Git Management Panel — Tasks

## Current Status: Not started — Phase 1 is next

---

## Phase 1: Foundation — Panel Shell, Store, Tab UI

- [ ] **Create `apps/web/src/gitPanelStore.ts`**
  - [ ] Define `GitPanelTab` type union ("changes" | "graph" | "branches" | "worktrees" | "stash" | "prs")
  - [ ] Define `ActivityLogEntry` interface
  - [ ] Define `ThreadGitPanelState` interface
  - [ ] Implement Zustand store with `persist` middleware (follow `fileEditorStore.ts`)
  - [ ] Implement `openPanel`, `closePanel`, `setActiveTab`, `setCommitMessage`
  - [ ] Implement `toggleActivityLog`, `addLogEntry`, `updateLogEntry`, `clearLog`
  - [ ] Implement `removeOrphanedStates`
  - [ ] Only persist `stateByThreadId` (not activity log)

- [ ] **Create `apps/web/src/components/GitPanelShell.tsx`**
  - [ ] Copy `FileEditorPanelShell.tsx` pattern
  - [ ] Support `mode: "sheet" | "sidebar"`
  - [ ] Handle electron drag-region logic

- [ ] **Create `apps/web/src/components/GitPanel.tsx`**
  - [ ] Render `GitPanelShell` with tab bar header
  - [ ] 6 tabs: Changes, Graph, Branches, Worktrees, Stash, PRs
  - [ ] Active tab indicator styling
  - [ ] Close button in header
  - [ ] Tab content area with placeholder content per tab
  - [ ] Activity Log placeholder at bottom (collapsible)

- [ ] **Modify `apps/web/src/routes/_chat.$threadId.tsx`**
  - [ ] Import `useGitPanelStore`
  - [ ] Add `LazyGitPanel = lazy(() => import("../components/GitPanel"))`
  - [ ] Add git panel to right panel content logic (mutual exclusion)
  - [ ] Wire open/close callbacks for mutual exclusion with diff + editor panels

- [ ] **Modify `apps/web/src/components/GitActionsControl.tsx`**
  - [ ] Import `useGitPanelStore`
  - [ ] Change button click to call `openPanel(threadId, "changes")`
  - [ ] Remove dropdown menu (keep smart label logic)
  - [ ] Keep progress toast functionality

- [ ] **Verify Phase 1**
  - [ ] Click git button → panel opens with 6 tabs
  - [ ] Tabs switch correctly
  - [ ] Panel closes via X
  - [ ] State persists across refresh
  - [ ] Mutual exclusion with DiffPanel/FileEditorPanel
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 2: Changes Tab — Detailed Status + Stage/Unstage

- [ ] **Add contracts in `packages/contracts/src/git.ts`**
  - [ ] `GitFileStatus` literal union
  - [ ] `GitStatusDetailedFile` struct
  - [ ] `GitStatusDetailedInput` / `GitStatusDetailedResult` structs
  - [ ] `GitStageFilesInput` / `GitUnstageFilesInput` structs

- [ ] **Add WS methods in `packages/contracts/src/ws.ts`**
  - [ ] `gitStatusDetailed`, `gitStageFiles`, `gitUnstageFiles` in `WS_METHODS`
  - [ ] Add to `WebSocketRequestBody` tagged union

- [ ] **Add to NativeApi in `packages/contracts/src/ipc.ts`**
  - [ ] `statusDetailed`, `stageFiles`, `unstageFiles` methods

- [ ] **Implement server methods**
  - [ ] Add to `apps/server/src/git/Services/GitCore.ts` interface
  - [ ] Implement `statusDetailed` in `apps/server/src/git/Layers/GitCore.ts`
    - [ ] Parse `git status --porcelain=2 --branch`
    - [ ] Parse `git diff --numstat` (unstaged stats)
    - [ ] Parse `git diff --cached --numstat` (staged stats)
    - [ ] Combine into `GitStatusDetailedResult`
  - [ ] Implement `stageFiles` in `Layers/GitCore.ts`
  - [ ] Implement `unstageFiles` in `Layers/GitCore.ts`
  - [ ] Add route cases in `apps/server/src/wsServer.ts`

- [ ] **Wire client transport in `apps/web/src/wsNativeApi.ts`**

- [ ] **Add React Query options**
  - [ ] `gitStatusDetailedQueryOptions` (3s stale, 10s refetch)
  - [ ] `gitStageFilesMutationOptions` (invalidate on settle)
  - [ ] `gitUnstageFilesMutationOptions` (invalidate on settle)

- [ ] **Create `apps/web/src/components/GitPanel/ChangesTab.tsx`**
  - [ ] Commit message textarea (value from store)
  - [ ] Action buttons: Commit / Commit & Push / Commit+Push+PR
  - [ ] Staged files section with unstage buttons
  - [ ] Unstaged files section with stage buttons
  - [ ] Untracked files section with stage buttons
  - [ ] Stage All / Unstage All buttons
  - [ ] Click file → open in FileEditorPanel
  - [ ] Refresh button
  - [ ] Loading/empty states

- [ ] **Verify Phase 2**
  - [ ] See staged vs unstaged files
  - [ ] Stage/unstage individual files works
  - [ ] Stage/unstage all works
  - [ ] Commit with message works
  - [ ] Commit & Push works
  - [ ] File list refreshes after operations
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 3: Branches Tab + Activity Log

- [ ] **Add `GitDeleteBranchInput` contract**
- [ ] **Add `gitDeleteBranch` WS method**
- [ ] **Implement `deleteBranch` on server**
- [ ] **Wire client transport + React Query**

- [ ] **Create `apps/web/src/components/GitPanel/BranchesTab.tsx`**
  - [ ] Local branches list with current indicator
  - [ ] Remote branches (collapsible)
  - [ ] Ahead/behind counts per branch
  - [ ] Search/filter input
  - [ ] Create Branch dialog (name + base picker)
  - [ ] Context menu: checkout, delete, create PR, push
  - [ ] Delete confirmation dialog

- [ ] **Create `apps/web/src/components/GitPanel/ActivityLog.tsx`**
  - [ ] Collapsible bottom section
  - [ ] Subscribe to `git.actionProgress` events
  - [ ] Render log entries with status icons (running/success/error)
  - [ ] Show duration per entry
  - [ ] Expandable error output
  - [ ] Auto-scroll to latest
  - [ ] Clear button

- [ ] **Wire into `GitPanel.tsx`**
  - [ ] ActivityLog at bottom with collapsible toggle
  - [ ] BranchesTab in tab content

- [ ] **Verify Phase 3**
  - [ ] Branches tab shows local + remote
  - [ ] Create branch works
  - [ ] Checkout works (with dirty-state warning)
  - [ ] Delete branch works (with confirmation)
  - [ ] Activity log shows git action progress
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 4: Stash Tab

- [ ] **Add stash contracts** (6 input/output schemas)
- [ ] **Add 6 stash WS methods**
- [ ] **Implement 6 stash server methods**
- [ ] **Wire client transport + React Query for all 6**

- [ ] **Create `apps/web/src/components/GitPanel/StashTab.tsx`**
  - [ ] Stash list with message, branch, date
  - [ ] Per-entry: Apply, Pop, Drop buttons
  - [ ] Drop confirmation dialog
  - [ ] Expandable diff preview per stash
  - [ ] Create Stash form (message + include-untracked toggle)
  - [ ] Empty state when no stashes

- [ ] **Verify Phase 4**
  - [ ] Create stash → appears in list
  - [ ] Apply → changes restored, stash remains
  - [ ] Pop → changes restored, stash removed
  - [ ] Drop → confirmation → removed
  - [ ] Show diff works
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 5: Worktrees Tab + PRs Tab

- [ ] **Add worktree list contracts + WS method**
- [ ] **Add PR list contracts + WS method**
- [ ] **Implement `listWorktrees` on server**
- [ ] **Implement `listPullRequests` on server (via GitHubCli)**
- [ ] **Wire client transport + React Query**

- [ ] **Create `apps/web/src/components/GitPanel/WorktreesTab.tsx`**
  - [ ] Worktree list with path, branch, badges
  - [ ] Create worktree dialog
  - [ ] Open / Remove buttons
  - [ ] Remove confirmation

- [ ] **Create `apps/web/src/components/GitPanel/PullRequestsTab.tsx`**
  - [ ] Open PRs list
  - [ ] Recently closed section
  - [ ] View (opens URL) / Checkout buttons
  - [ ] Create PR button
  - [ ] State filter

- [ ] **Verify Phase 5**
  - [ ] Worktrees tab works
  - [ ] PRs tab lists open PRs
  - [ ] Checkout PR works
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 6: Graph Tab — SVG Commit Visualization

- [ ] **Add git log contracts + WS method**
- [ ] **Implement `log` on server**
- [ ] **Wire client transport + React Query**

- [ ] **Create `apps/web/src/components/GitPanel/graphLayout.ts`**
  - [ ] Lane assignment algorithm
  - [ ] SVG path data generation
  - [ ] Color assignment per lane
  - [ ] Unit tests

- [ ] **Create `apps/web/src/components/GitPanel/GraphTab.tsx`**
  - [ ] SVG graph overlay
  - [ ] Commit list with details
  - [ ] Branch/tag badges
  - [ ] Branch filter dropdown
  - [ ] Pagination ("Load more")
  - [ ] Click commit → view diff

- [ ] **Verify Phase 6**
  - [ ] Visual graph lines render correctly
  - [ ] Branch badges with colors
  - [ ] Pagination works
  - [ ] Branch filter works
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Phase 7: Polish + Migration

- [ ] **Slim down `GitActionsControl.tsx`** — remove dialogs, keep smart button
- [ ] **Enhance Activity Log** — capture all git mutations
- [ ] **Add keyboard shortcuts** — Cmd+Shift+G toggle, 1-6 tab switch
- [ ] **Final verification**
  - [ ] End-to-end workflow: stage → commit → push → create PR
  - [ ] Stash workflow: stash → checkout → pop
  - [ ] Branch workflow: create → changes → commit → PR
  - [ ] Mobile sheet mode for all tabs
  - [ ] `bun fmt && bun lint && bun typecheck` passes

---

## Notes

- Phase 4 and Phase 5 are independent and can be developed in parallel after Phase 3
- Phase 6 (Graph) is the most complex UI work — the lane assignment algorithm needs careful testing
- Phase 7 is a cleanup/polish pass, not a hard dependency for any other phase
- The existing `GitActionsControl.tsx` stays functional throughout — we modify it incrementally, not all at once
