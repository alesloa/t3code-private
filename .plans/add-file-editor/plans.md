# In-App File Editor Panel — Implementation Plan

## Status: IN_PROGRESS
## Last Updated: 2026-03-27

## Goal

Add a robust in-app code editor panel (CodeMirror 6) that opens when clicking a file in the file browser. It occupies the same right sidebar slot as the diff panel (mutually exclusive), supports syntax highlighting, line numbers, markdown preview, and file saving.

## Context

The file browser feature was already implemented across prior conversation turns:
- **File browser**: Sheet sliding from right, triggered by `FolderSearchIcon` toggle in chat header
- **File tree**: Lazy-loaded directory nodes using `projects.listEntries` API
- **Context menu**: Right-click on files/dirs gives Copy Path, Copy Relative Path, Copy Name, Open in Editor
- **Path input**: Editable path bar to navigate to any directory
- **`projects.readFile` API**: Already built (contracts, server handler, client transport)
- **`projects.writeFile` API**: Already existed

The current file editor is a plain `<textarea>` inside the file browser Sheet. The user wants it replaced with a proper code editor in a resizable right panel, matching the diff panel's UX.

## Technical Approach

### Editor Library: CodeMirror 6

Chosen over Monaco (too heavy, ~2MB) and Shiki-only (read-only). CodeMirror 6 is modular (~150KB gzipped), supports React 19, and provides line numbers, syntax highlighting, bracket matching, fold gutter, find/replace, and keybindings out of the box via `basicSetup`.

### Panel Architecture

Mirrors the diff panel exactly:
- **Desktop (>1180px)**: `SidebarProvider` + `Sidebar` with `collapsible="offcanvas"`, resizable (min 416px, default `clamp(28rem,48vw,44rem)`)
- **Mobile (<=1180px)**: `Sheet` with `side="right"` and `w-[min(88vw,820px)]`
- **Mutual exclusion**: Opening the file editor closes the diff panel (strips `?diff=1` from URL); opening the diff closes the editor (`fileEditorStore.closePanel(threadId)`)

### State Management: Zustand Store

Thread-scoped, persisted to localStorage (like `terminalStateStore.ts`). Stores `{ open, tabs: [{ relativePath, cwd }], activeTabIndex }`. File contents are NOT persisted — re-fetched on mount.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `apps/web/src/fileEditorStore.ts` | Zustand store for file editor state (thread-scoped, persisted) |
| CREATE | `apps/web/src/lib/fileEditorUtils.ts` | Language resolution, binary detection, markdown detection |
| CREATE | `apps/web/src/components/CodeMirrorEditor.tsx` | CodeMirror 6 React wrapper with theme/language compartments |
| CREATE | `apps/web/src/components/MarkdownPreview.tsx` | Markdown preview using react-markdown + remark-gfm |
| CREATE | `apps/web/src/components/FileEditorPanelShell.tsx` | Panel chrome (header, border, Electron drag region) |
| CREATE | `apps/web/src/components/FileEditorPanel.tsx` | Main panel: tab strip, header controls, body (editor/preview/error) |
| EDIT | `apps/web/package.json` | Add CodeMirror 6 dependencies |
| EDIT | `apps/web/src/routes/_chat.$threadId.tsx` | Wire file editor panel into layout (sidebar + sheet) |
| EDIT | `apps/web/src/components/chat/FileBrowserPopover.tsx` | Remove inline textarea editor, dispatch to store |
| EDIT | `apps/web/src/components/chat/ChatHeader.tsx` | Pass `activeThreadId` to FileBrowserPanel |
| EDIT | `apps/web/src/components/ChatView.tsx` | Mutual exclusion: closing editor when diff opens |

## Code Snippets

### fileEditorStore.ts — State Shape

```typescript
import { type ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface FileEditorTab {
  relativePath: string;
  cwd: string;
}

interface ThreadFileEditorState {
  open: boolean;
  tabs: FileEditorTab[];
  activeTabIndex: number;
}

interface FileEditorStoreState {
  stateByThreadId: Record<string, ThreadFileEditorState>;
  openFile: (threadId: ThreadId, cwd: string, relativePath: string) => void;
  closeTab: (threadId: ThreadId, index: number) => void;
  setActiveTab: (threadId: ThreadId, index: number) => void;
  closePanel: (threadId: ThreadId) => void;
  removeOrphanedStates: (activeThreadIds: Set<ThreadId>) => void;
}
```

### CodeMirrorEditor.tsx — Key Pattern

```typescript
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";

// Compartments for hot-swapping
const themeCompartment = new Compartment();
const languageCompartment = new Compartment();

// On mount: create EditorView with extensions
// On theme change: view.dispatch({ effects: themeCompartment.reconfigure(newTheme) })
// On file switch: view.dispatch({ changes: { from: 0, to: doc.length, insert: newContents } })
// Cmd+S: keymap.of([{ key: "Mod-s", run: () => { onSave(); return true; } }])
```

### _chat.$threadId.tsx — Layout Integration Pattern

```typescript
// Generalized right panel that hosts either diff or editor
const rightPanelOpen = diffOpen || editorOpen;
const rightPanelContent = editorOpen ? (
  <LazyFileEditorPanel mode="sidebar" />
) : shouldRenderDiffContent ? (
  <LazyDiffPanel mode="sidebar" />
) : null;

// Desktop: wrap in SidebarProvider + Sidebar (same as current DiffPanelInlineSidebar)
// Mobile: wrap in Sheet (same as current DiffPanelSheet)
```

### fileEditorUtils.ts — Language Resolution

```typescript
export async function resolveEditorLanguage(filePath: string): Promise<Extension> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js": case "jsx": case "ts": case "tsx": case "mjs": case "cjs":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: ext.includes("x"), typescript: ext.includes("ts") });
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "css": case "scss":
      return (await import("@codemirror/lang-css")).css();
    case "html": case "htm": case "vue": case "svelte":
      return (await import("@codemirror/lang-html")).html();
    case "md": case "mdx":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "py":
      return (await import("@codemirror/lang-python")).python();
    default: {
      const { languages } = await import("@codemirror/language-data");
      const lang = languages.find((l) => l.extensions.includes(ext));
      if (lang) return lang.load();
      return [];
    }
  }
}
```

## Integration Points

### File Browser → File Editor Store
- `FileBrowserPopover.tsx` `onOpenFile` callback calls `fileEditorStore.openFile(threadId, cwd, relativePath)`
- Closes the file browser Sheet after dispatching
- Strips `?diff=1` from URL via `navigate` to close diff panel

### File Editor Panel → Read/Write API
- Reads file: `ensureNativeApi().projects.readFile({ cwd, relativePath })`
- Writes file: `ensureNativeApi().projects.writeFile({ cwd, relativePath, contents })`
- Both APIs already exist and work (built in prior conversation turns)

### Layout → Store
- `_chat.$threadId.tsx` reads `useFileEditorStore((s) => s.stateByThreadId[threadId]?.open ?? false)`
- `ChatView.tsx` `onToggleDiff` callback also calls `fileEditorStore.closePanel(threadId)` for mutual exclusion

### Theme Sync
- `CodeMirrorEditor` receives `theme` prop from `useTheme().resolvedTheme`
- Uses `Compartment` to hot-swap between `githubLight` and `githubDark`

## Decisions Made

1. **Shared sidebar slot (mutually exclusive)** over separate panels — avoids consuming too much horizontal space, simpler layout
2. **Zustand store over URL params** — multi-tab state is too complex for URL; store allows direct access from deeply nested FileBrowserPanel without prop drilling
3. **CodeMirror 6 over Monaco** — Monaco is ~2MB and overkill; CodeMirror is modular and ~150KB
4. **Dynamic language imports** — keeps initial bundle small; languages loaded on demand when files are opened
5. **`@uiw/codemirror-theme-github`** — clean GitHub-style light/dark themes that match the app's aesthetic
6. **No file content persistence** — only tab metadata (path, cwd) persisted; contents re-fetched on mount to avoid stale data
7. **`DiffPanelShell` pattern replicated** (not shared) — keeps the first PR focused; can be unified later

## Packages to Install

```bash
cd apps/web && bun add codemirror @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-css @codemirror/lang-html @codemirror/lang-markdown @codemirror/lang-python @codemirror/language-data @uiw/codemirror-theme-github
```
