# Git Management Panel — Important Context

## Critical Information

- **This is a T3 Code app** — a monorepo with `apps/server`, `apps/web`, `packages/contracts`, `packages/shared`. All four packages may need changes.
- **Effect framework** is used on the server for all services. Git operations are Effect services (`GitCore`, `GitManager`) with Layer implementations. Follow the existing Effect pattern — do NOT use raw try/catch or Promise-based patterns on the server.
- **Schema validation** uses `effect/Schema` (NOT Zod). All new input/output types go in `packages/contracts/src/git.ts` using `Schema.Struct`, `Schema.Literal`, etc.
- **Base-UI v1.2.0** is the component library (headless, unstyled). NOT shadcn/ui. Check `apps/web/src/components/ui/` for existing wrappers before creating new ones.
- **The `GitActionsControl.tsx` is 38KB** — it's a complex component with commit dialogs, file selection, progress tracking, and default-branch safety checks. Phase 1 modifies it to open the panel, but the full refactor happens in Phase 7. Don't try to gut it in Phase 1.

## Caveats

- **`git status --porcelain=2`** output format is different from porcelain v1. Use `--porcelain=2 --branch` for the detailed status endpoint. The XY field has two characters: first = staged status, second = unstaged status.
- **The right panel system has a 1180px breakpoint**. Below that, panels render as sheets (slide-in modals). Above, they render as inline resizable sidebars. The git panel must work in both modes.
- **Mutual exclusion of right panels** — only one can be open at a time. Opening the git panel must close the diff panel and file editor panel, and vice versa. This logic is in `_chat.$threadId.tsx`.
- **The `executeGit` helper** in `apps/server/src/git/Layers/GitCore.ts` is the internal function for running git commands. All new git operations should use this helper — it handles working directory, error wrapping, and output capture.
- **The `GitHubCli` service** wraps `gh` CLI commands. PR listing goes through this service, not raw git commands.
- **React Query cache keys**: The existing pattern uses `gitQueryKeys` object in `projectReactQuery.ts`. New queries should follow the same key structure to ensure proper invalidation.
- **Thread-scoped state**: All panel state is per-thread (keyed by `ThreadId`). The same user might have different git panels open in different threads pointing to different projects.
- **`filePaths` on `GitRunStackedActionInput`** already exists — it allows committing only specific files. The Changes tab will use this to commit only staged files.
- **The `onActionProgress` callback** in `wsNativeApi.ts` is already wired for real-time git action progress. The Activity Log subscribes to this.
- **Don't use `git add .` or `git add -A`** for staging — always use explicit file paths to avoid staging sensitive files.

## Dependencies

- No new npm packages needed for Phases 1-5
- Phase 6 (Graph Tab) may benefit from `@tanstack/react-virtual` for virtualized scrolling if not already installed (check `apps/web/package.json`)
- All git operations require `git` CLI available on the server machine
- PR operations require `gh` (GitHub CLI) authenticated

## Testing Notes

### Verification Commands
```bash
bun fmt        # Format check
bun lint       # Lint check
bun typecheck  # TypeScript type check
bun run test   # Run Vitest (NEVER use `bun test`)
```

### Manual Testing
- Open the app in browser at the dev server URL
- Navigate to a project that has a git repository
- Click the git action button in the header → panel should open
- Test each tab with real git operations
- Test mobile (resize below 1180px) → panel should switch to sheet mode
- Test mutual exclusion: open diff panel → git panel should close

### Edge Cases to Test
- No git repo (project without `.git`) — git button should be hidden
- Empty repo (no commits yet) — graph tab should handle gracefully
- Detached HEAD state — branches tab should show current detached state
- Large repos (many files, branches, commits) — performance matters
- No GitHub CLI (`gh` not installed) — PR tab should show helpful error

## Known Limitations

- **No merge/rebase support** — by design, branch merging goes through PRs
- **No interactive rebase** — out of scope
- **No blame/annotate** — could be added later
- **No diff editing** — files open in FileEditorPanel, not inline diff editing
- **Graph pagination is simple** — loads 50 at a time with "Load more", not infinite scroll initially
- **No conflict resolution UI** — if operations cause conflicts, show the error in activity log

## Related Files

- Approved plan: `/Users/alesloas/.claude/plans/cuddly-leaping-giraffe.md`
- Existing git integration tests: `.plans/git-flows-integration-tests.md`
- Existing git integration plan: `.plans/git-integration-branch-picker-worktrees.md`
- File editor panel (pattern to follow): `apps/web/src/components/FileEditorPanel.tsx`
- File editor store (pattern to follow): `apps/web/src/fileEditorStore.ts`
- File editor shell (pattern to follow): `apps/web/src/components/FileEditorPanelShell.tsx`

## Recovery Instructions

If resuming after compaction:
1. Read this file first for caveats and critical context
2. Check `task.md` for current progress — find the RESUME HERE marker
3. Read `plans.md` for full technical details of the current phase
4. Check `git status` for any uncommitted work
5. Read the approved plan at `/Users/alesloas/.claude/plans/cuddly-leaping-giraffe.md`
6. Check `apps/web/src/components/GitPanel/` for any already-created files
7. Check `packages/contracts/src/git.ts` for any already-added schemas
8. Run `bun typecheck` to see current state of compilation
