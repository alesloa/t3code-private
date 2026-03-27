# In-App File Editor Panel — Tasks

## Current Status: Phase 3 complete — Integration done, verification passing

## Phase 1 — Foundation

- [x] **Install CodeMirror packages** in `apps/web/`
  ```bash
  cd apps/web && bun add codemirror @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-css @codemirror/lang-html @codemirror/lang-markdown @codemirror/lang-python @codemirror/language-data @uiw/codemirror-theme-github
  ```
- [x] **Create `apps/web/src/fileEditorStore.ts`** — Zustand store
  - Thread-scoped state: `{ open, tabs: [{ relativePath, cwd }], activeTabIndex }`
  - Actions: `openFile`, `closeTab`, `setActiveTab`, `closePanel`, `removeOrphanedStates`
  - Persist to localStorage (key: `t3code:file-editor-state:v1`)
  - Follow `terminalStateStore.ts` patterns exactly
- [x] **Create `apps/web/src/lib/fileEditorUtils.ts`** — Utilities
  - `resolveEditorLanguage(filePath)` — dynamic CodeMirror language imports
  - `isMarkdownFile(filePath)` — `.md`/`.mdx` check
  - `isBinaryContent(contents)` — null byte check in first 8KB
  - `BINARY_EXTENSIONS` — Set of binary file extensions
  - `LARGE_FILE_MAX_BYTES` — 5MB threshold

## Phase 2 — Core Components

- [x] **Create `apps/web/src/components/CodeMirrorEditor.tsx`**
  - Props: `contents`, `filePath`, `theme`, `onChange`, `onSave`
  - `EditorView` lifecycle management via `useRef`
  - `Compartment` for theme (`githubLight`/`githubDark`) and language
  - `basicSetup` from `codemirror` package
  - Cmd+S keybinding → `onSave`
  - Document replacement on file switch via transaction
- [x] **Create `apps/web/src/components/MarkdownPreview.tsx`**
  - `react-markdown` + `remark-gfm` (already installed)
  - Scrollable div with prose typography
- [x] **Create `apps/web/src/components/FileEditorPanelShell.tsx`**
  - Mirror `DiffPanelShell.tsx` pattern
  - Props: `mode`, `header` (ReactNode), `children`
  - Electron drag region handling
  - Border/background styling
- [x] **Create `apps/web/src/components/FileEditorPanel.tsx`**
  - Props: `mode: "sheet" | "sidebar"`
  - Export as default (for lazy loading)
  - Header: tab strip (VscodeEntryIcon + filename + dirty dot + close button) + controls
  - Body: loading spinner | error | binary message | MarkdownPreview | CodeMirrorEditor
  - Read file via `ensureNativeApi().projects.readFile()`
  - Save via `ensureNativeApi().projects.writeFile()`
  - Dirty detection: `contents !== savedContents`
  - Markdown preview toggle for `.md` files
  - Gets `threadId` via `useParams` (same pattern as `DiffPanel.tsx`)

## Phase 3 — Integration

- [x] **Modify `apps/web/src/routes/_chat.$threadId.tsx`** — Layout wiring
  - Generalized right panel components: `RightPanelInlineSidebar`, `RightPanelSheet`
  - Lazy-loaded `FileEditorPanel` alongside `DiffPanel`
  - `editorOpen` read from `useFileEditorStore` for current threadId
  - Mutual exclusion: `openDiff` calls `closeEditorPanel`; `closeRightPanel` handles both
  - Desktop: reuses `SidebarProvider`/`Sidebar` with swapped children based on active panel
  - Mobile: reuses `Sheet` with swapped children
  - `hasOpenedEditor` / `shouldRenderEditorContent` pattern (keeps panel mounted after first open)
- [x] **Modify `apps/web/src/components/chat/FileBrowserPopover.tsx`**
  - Removed `FileEditorView` component entirely
  - Removed `openFilePath` state and `onBackToTree`
  - Added `threadId` prop to `FileBrowserPanel`
  - `onOpenFile` → `fileEditorStore.openFile(threadId, cwd, relativePath)` + close sheet + strip `?diff=1`
  - Uses `useNavigate` for URL manipulation
- [x] **Modify `apps/web/src/components/chat/ChatHeader.tsx`**
  - Pass `activeThreadId` to `<FileBrowserPanel threadId={activeThreadId}>`
- [x] **Modify `apps/web/src/components/ChatView.tsx`**
  - Import `useFileEditorStore`
  - In `onToggleDiff` (when opening diff): call `closeEditorPanel(threadId)`

## Phase 4 — Edge Cases & Polish

- [x] Binary file detection — shows error message with `FileWarningIcon` (checks extension + content null bytes)
- [x] Large file handling (>5MB) — shows size error message
- [ ] Unsaved changes confirmation dialog on tab close / file switch

## Verification

- [x] `bun fmt` passes
- [x] `bun lint` passes
- [x] `bun typecheck` passes
- [ ] `bun run test` — no new failures (pre-existing sqlite failures are OK)
- [ ] Manual test: file browser → click file → editor panel opens
- [ ] Manual test: syntax highlighting works for .ts, .json, .css, .md
- [ ] Manual test: edit + Cmd+S saves file
- [ ] Manual test: diff panel ↔ editor panel mutual exclusion
- [ ] Manual test: mobile viewport → full-width sheet

## Notes

- All server-side APIs (`readFile`, `writeFile`, `listEntries`) are DONE — no server work needed
- The `FileEditorView` textarea component has been removed from `FileBrowserPopover.tsx`
- The `openFilePath` state and dual-mode rendering have been removed from `FileBrowserPanel`
- Pre-existing test failures (137) in `t3:test` are all `node:sqlite` version issues — NOT our changes
- Initial typecheck caught `useStore((s) => s.activeThreadId)` — `AppStore` has no `activeThreadId`. Fixed by using `useParams` from `@tanstack/react-router` (same pattern as `DiffPanel.tsx`)
