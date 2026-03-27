# In-App File Editor Panel — Important Context

## Critical Information

- The **file browser** (Sheet with file tree, context menus, path input) is ALREADY BUILT and working. This plan only adds the **editor panel** that opens when clicking a file.
- The **`projects.readFile`** and **`projects.writeFile`** APIs are ALREADY BUILT (contracts, server handler, client transport). No server-side work needed.
- The **diff panel** architecture in `_chat.$threadId.tsx` is the exact template to follow. The file editor shares the same sidebar slot.
- The current inline `FileEditorView` component (plain textarea) inside `FileBrowserPopover.tsx` must be REMOVED — it's being replaced by the new panel.

## Caveats

- `resolveWorkspacePath` in `wsServer.ts` was renamed from `resolveWorkspaceWritePath` during prior work — both read and write handlers use it. Don't create a duplicate.
- The `Sidebar` component from `~/components/ui/sidebar` supports `resizable` prop with `{ minWidth, shouldAcceptWidth, storageKey }` — the `shouldAcceptInlineSidebarWidth` function in `_chat.$threadId.tsx` prevents the sidebar from squeezing the composer too small. Reuse this logic.
- `useMediaQuery` hook is at `~/hooks/useMediaQuery`. The breakpoint `"(max-width: 1180px)"` determines sheet vs sidebar mode.
- `DiffPanelShell` mode types: `"inline" | "sheet" | "sidebar"` — `"sidebar"` is what gets rendered inside the `SidebarProvider` on desktop; `"sheet"` is for mobile Sheet; `"inline"` is for standalone rendering.
- The `hasOpenedDiff` / `shouldRenderDiffContent` pattern in `_chat.$threadId.tsx` ensures the diff panel stays mounted after first open (for performance). Apply the same pattern for the file editor.
- The test suite has pre-existing failures in `t3:test` (137 failures) all caused by `Node.js 22.15.0 is missing required node:sqlite APIs`. These are NOT related to our changes.
- `bun test` is wrong — must use `bun run test` (runs Vitest).
- The `Button` component has no `xs` size variant. Use `sm` with custom className for smaller buttons.

## Dependencies

- **CodeMirror 6**: `codemirror`, `@codemirror/lang-*`, `@codemirror/language-data`, `@uiw/codemirror-theme-github`
- **Already installed**: `react-markdown`, `remark-gfm`, `zustand`, `@tanstack/react-query`, `lucide-react`
- **No server changes needed** — all APIs are already in place

## Testing Notes

### Automated
```bash
bun fmt        # oxfmt formatter
bun lint       # oxlint linter
bun typecheck  # turbo run typecheck across all packages
bun run test   # vitest (NOT `bun test`)
```

### Manual Testing Scenarios
1. Open file browser → click `.ts` file → editor panel slides in with syntax highlighting
2. Click `.json` file → JSON highlighting
3. Click `.md` file → CodeMirror with markdown highlighting + toggle for preview mode
4. Edit file → dirty indicator appears → Cmd+S saves → toast confirmation
5. Open another file → new tab appears in tab strip
6. Close tab → removed from strip
7. Toggle diff panel → file editor closes; open file → diff panel closes
8. Mobile viewport (≤1180px) → editor opens as full-width sheet
9. Open binary file (`.png`) → "Binary file" error message
10. Open large file (>5MB) → size error with "Open in Editor" external button

## Known Limitations

- No file creation/deletion from the file browser (only browse + edit existing)
- No git integration in the editor (no inline blame, no diff markers)
- Language detection falls back to plain text for uncommon extensions
- No collaborative editing / conflict resolution
- No auto-save (manual Cmd+S only)
- Tab state persists across sessions but file contents are re-fetched (intentional to avoid stale data)

## Related Files

### Already Modified (prior conversation turns)
- `packages/contracts/src/project.ts` — `ProjectListEntriesInput/Result`, `ProjectReadFileInput/Result` schemas
- `packages/contracts/src/ws.ts` — `projectsListEntries`, `projectsReadFile` WS methods
- `packages/contracts/src/ipc.ts` — `listEntries`, `readFile` in `NativeApi.projects`
- `apps/server/src/workspaceEntries.ts` — `listWorkspaceEntries()` function
- `apps/server/src/wsServer.ts` — `projectsListEntries`, `projectsReadFile` handlers; renamed `resolveWorkspacePath`
- `apps/web/src/wsNativeApi.ts` — `listEntries`, `readFile` transport calls
- `apps/web/src/lib/projectReactQuery.ts` — `projectListEntriesQueryOptions`
- `apps/web/src/components/chat/FileBrowserPopover.tsx` — File browser with tree, context menus, path input, inline editor (to be refactored)
- `apps/web/src/components/chat/ChatHeader.tsx` — `FileBrowserPanel` integrated, `activeProjectCwd` prop
- `apps/web/src/components/ChatView.tsx` — passes `activeProjectCwd` prop

### Key Reference Files (read-only, for patterns)
- `apps/web/src/routes/_chat.$threadId.tsx` — Diff panel layout integration (THE template)
- `apps/web/src/components/DiffPanelShell.tsx` — Panel chrome pattern
- `apps/web/src/components/DiffPanel.tsx` — Panel content pattern
- `apps/web/src/terminalStateStore.ts` — Zustand persist pattern
- `apps/web/src/components/ChatMarkdown.tsx` — Shiki highlighting + react-markdown usage
- `apps/web/src/hooks/useTheme.ts` — Theme hook (`resolvedTheme`)
- `apps/web/src/hooks/useMediaQuery.ts` — Media query hook
- `apps/web/src/components/chat/VscodeEntryIcon.tsx` — File type icons

## Recovery Instructions

If resuming after compaction:
1. Read this file first for critical context
2. Read `task.md` for current progress — find the `RESUME HERE` marker
3. Read `plans.md` for full technical details and code snippets
4. Check `git status` for any uncommitted work
5. The plan file at `/Users/alesloas/.claude/plans/gentle-booping-raven.md` has the approved plan
6. All server-side work is DONE — focus is purely on `apps/web/src/` frontend code
