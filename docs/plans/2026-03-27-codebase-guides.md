# Codebase Guides Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Guides" feature that lets the user generate interactive HTML learning content about any project, directory, or file — viewable in-app via iframe, cached for reuse, and regeneratable as code evolves.

**Architecture:** The server spawns `claude` CLI processes to generate self-contained HTML guides using the codebase-to-course skill prompts. Guides are persisted as HTML files with JSON metadata in the server's state directory. The web app adds a sidebar tab (book icon) showing guides grouped by project, a scope-picker dialog for creating new guides, a progress push channel for generation status, and an iframe-based viewer panel for reading guides. The feature is called "Guides" throughout the UI.

**Tech Stack:** Effect Schema (contracts), Node.js child_process (CLI spawning), WebSocket RPC + push channels (real-time progress), React/Zustand (UI state), TanStack Router (viewer route), iframe (HTML rendering)

---

## Task 1: Contracts — Guide Schemas

**Files:**

- Create: `packages/contracts/src/guide.ts`
- Modify: `packages/contracts/src/baseSchemas.ts` (add `GuideId`)
- Modify: `packages/contracts/src/index.ts` (re-export)

**Step 1: Add GuideId to baseSchemas.ts**

After the last `makeEntityId` call (line 44 in `baseSchemas.ts`), add:

```typescript
export const GuideId = makeEntityId("GuideId");
export type GuideId = typeof GuideId.Type;
```

**Step 2: Create `packages/contracts/src/guide.ts`**

```typescript
import { Schema } from "effect";
import { GuideId, IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

// ── Enumerations ─────────────────────────────────────────────────────

export const GuideScope = Schema.Literal("project", "directory", "file", "topic");
export type GuideScope = typeof GuideScope.Type;

export const GuideDepth = Schema.Literal("quick", "full");
export type GuideDepth = typeof GuideDepth.Type;

export const GuideStatus = Schema.Literal("queued", "generating", "completed", "failed");
export type GuideStatus = typeof GuideStatus.Type;

// ── Guide Metadata (persisted as JSON alongside HTML) ────────────────

export const GuideMeta = Schema.Struct({
  id: GuideId,
  /** Display title for the guide */
  title: TrimmedNonEmptyString,
  /** Absolute path to the project root */
  projectCwd: TrimmedNonEmptyString,
  /** Scope of analysis */
  scope: GuideScope,
  /** Relative path within project (empty string for project/topic scope) */
  targetPath: Schema.String,
  /** Freeform topic description when scope is "topic" (e.g., "How does WebSocket reconnection work?") */
  topicQuery: Schema.NullOr(Schema.String),
  /** Quick explanation or full interactive course */
  depth: GuideDepth,
  /** Current generation status */
  status: GuideStatus,
  /** Error message if status === "failed" */
  errorMessage: Schema.NullOr(Schema.String),
  /** Filename of the HTML output (relative to guides dir) */
  htmlFilename: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type GuideMeta = typeof GuideMeta.Type;

// ── RPC Input/Output Schemas ─────────────────────────────────────────

/** List all guides, optionally filtered by project cwd */
export const GuideListInput = Schema.Struct({
  projectCwd: Schema.optional(TrimmedNonEmptyString),
});
export type GuideListInput = typeof GuideListInput.Type;

export const GuideListResult = Schema.Struct({
  guides: Schema.Array(GuideMeta),
});
export type GuideListResult = typeof GuideListResult.Type;

/** Request generation of a new guide */
export const GuideGenerateInput = Schema.Struct({
  projectCwd: TrimmedNonEmptyString,
  scope: GuideScope,
  /** Relative path within project. Required for directory/file scope, empty string for project/topic scope */
  targetPath: Schema.String,
  depth: GuideDepth,
  /** Freeform topic description when scope is "topic" (e.g., "How does auth work?") */
  topicQuery: Schema.optional(Schema.String),
  /** Optional custom title. If omitted, auto-generated from scope + target/topic */
  title: Schema.optional(TrimmedNonEmptyString),
});
export type GuideGenerateInput = typeof GuideGenerateInput.Type;

export const GuideGenerateResult = Schema.Struct({
  guide: GuideMeta,
});
export type GuideGenerateResult = typeof GuideGenerateResult.Type;

/** Read the HTML content of a completed guide */
export const GuideReadInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideReadInput = typeof GuideReadInput.Type;

export const GuideReadResult = Schema.Struct({
  guide: GuideMeta,
  html: Schema.String,
});
export type GuideReadResult = typeof GuideReadResult.Type;

/** Delete a guide and its HTML file */
export const GuideDeleteInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideDeleteInput = typeof GuideDeleteInput.Type;

export const GuideDeleteResult = Schema.Struct({
  guideId: GuideId,
});
export type GuideDeleteResult = typeof GuideDeleteResult.Type;

/** Regenerate an existing guide (updates in place) */
export const GuideRegenerateInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideRegenerateInput = typeof GuideRegenerateInput.Type;

export const GuideRegenerateResult = Schema.Struct({
  guide: GuideMeta,
});
export type GuideRegenerateResult = typeof GuideRegenerateResult.Type;

// ── Push Event for generation progress ───────────────────────────────

export const GuideProgressEvent = Schema.Struct({
  guideId: GuideId,
  status: GuideStatus,
  /** Human-readable progress message (e.g., "Analyzing codebase...", "Building module 3/7...") */
  message: Schema.String,
  /** 0-100 progress percentage, null if indeterminate */
  percent: Schema.NullOr(Schema.Number),
  /** Set when status transitions to "completed" or "failed" */
  updatedMeta: Schema.optional(GuideMeta),
});
export type GuideProgressEvent = typeof GuideProgressEvent.Type;
```

**Step 3: Add to index.ts**

Add `export * from "./guide";` to `packages/contracts/src/index.ts`.

**Step 4: Add WS methods and channel to ws.ts**

Add to `WS_METHODS`:

```typescript
  // Guide methods
  guideList: "guide.list",
  guideGenerate: "guide.generate",
  guideRead: "guide.read",
  guideDelete: "guide.delete",
  guideRegenerate: "guide.regenerate",
```

Add to `WS_CHANNELS`:

```typescript
  guideProgress: "guide.progress",
```

Add to `WebSocketRequestBody` union (before the closing `]`):

```typescript
  // Guide methods
  tagRequestBody(WS_METHODS.guideList, GuideListInput),
  tagRequestBody(WS_METHODS.guideGenerate, GuideGenerateInput),
  tagRequestBody(WS_METHODS.guideRead, GuideReadInput),
  tagRequestBody(WS_METHODS.guideDelete, GuideDeleteInput),
  tagRequestBody(WS_METHODS.guideRegenerate, GuideRegenerateInput),
```

Add imports from `./guide` at the top of `ws.ts`.

Add push schema + channel entries:

```typescript
export const WsPushGuideProgress = makeWsPushSchema(WS_CHANNELS.guideProgress, GuideProgressEvent);
```

Add `GuideProgressEvent` to `WsPushPayloadByChannel`, `WsPushChannelSchema`, and `WsPush` union.

**Step 5: Add Guide types to NativeApi in ipc.ts**

Add to `NativeApi` interface:

```typescript
  guides: {
    list: (input: GuideListInput) => Promise<GuideListResult>;
    generate: (input: GuideGenerateInput) => Promise<GuideGenerateResult>;
    read: (input: GuideReadInput) => Promise<GuideReadResult>;
    delete: (input: GuideDeleteInput) => Promise<GuideDeleteResult>;
    regenerate: (input: GuideRegenerateInput) => Promise<GuideRegenerateResult>;
    onProgress: (callback: (event: GuideProgressEvent) => void) => () => void;
  };
```

**Step 6: Run typecheck**

Run: `bun typecheck`
Expected: May have errors in wsServer.ts (exhaustive switch) and wsNativeApi.ts (missing implementation) — those are expected and will be fixed in later tasks.

**Step 7: Commit**

```bash
git add packages/contracts/src/guide.ts packages/contracts/src/baseSchemas.ts packages/contracts/src/index.ts packages/contracts/src/ws.ts packages/contracts/src/ipc.ts
git commit -m "feat: add Guide domain contracts and WS protocol schemas"
```

---

## Task 2: Server — Guide Manager Service

**Files:**

- Create: `apps/server/src/guideManager.ts`
- Modify: `apps/server/src/config.ts` (add `guidesDir` to derived paths)

**Step 1: Add guidesDir to ServerDerivedPaths**

In `apps/server/src/config.ts`, add `readonly guidesDir: string;` to `ServerDerivedPaths` interface and add the path derivation in `deriveServerPaths`:

```typescript
guidesDir: join(stateDir, "guides"),
```

**Step 2: Create guideManager.ts**

This service handles:

- CRUD for guide metadata (JSON files in `guidesDir`)
- Spawning `claude` CLI to generate HTML
- Emitting progress events via a callback

Key design decisions:

- Each guide has a directory: `{guidesDir}/{guideId}/` containing `meta.json` and `guide.html`
- The CLI is spawned with `--dangerously-skip-permissions` and the codebase-to-course prompt
- Progress is parsed from CLI stdout (claude CLI outputs structured JSON events)
- Only one generation per guide at a time (Map of active generation AbortControllers)

```typescript
/**
 * GuideManager — Manages guide lifecycle: create, generate, read, delete.
 *
 * Spawns `claude` CLI processes to generate interactive HTML guides from
 * codebase analysis using the codebase-to-course skill prompts.
 */
import { Effect, ServiceMap, Layer } from "effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  GuideId,
  GuideMeta,
  GuideGenerateInput,
  GuideListInput,
  GuideListResult,
  GuideReadInput,
  GuideReadResult,
  GuideDeleteInput,
  GuideDeleteResult,
  GuideRegenerateInput,
  GuideRegenerateResult,
  GuideGenerateResult,
  GuideProgressEvent,
  GuideScope,
  GuideDepth,
} from "@t3tools/contracts";

export type GuideProgressCallback = (event: GuideProgressEvent) => void;

export interface GuideManagerShape {
  readonly list: (input: GuideListInput) => Promise<GuideListResult>;
  readonly generate: (
    input: GuideGenerateInput,
    onProgress: GuideProgressCallback,
  ) => Promise<GuideGenerateResult>;
  readonly read: (input: GuideReadInput) => Promise<GuideReadResult>;
  readonly remove: (input: GuideDeleteInput) => Promise<GuideDeleteResult>;
  readonly regenerate: (
    input: GuideRegenerateInput,
    onProgress: GuideProgressCallback,
  ) => Promise<GuideRegenerateResult>;
}

export class GuideManager extends ServiceMap.Service<GuideManager, GuideManagerShape>()(
  "t3/guideManager/GuideManager",
) {}
```

Implementation details for each method:

**list():** Read all `meta.json` files from `guidesDir/*/meta.json`, optionally filter by `projectCwd`.

**generate():**

1. Create guide directory and meta.json with status "queued"
2. Build the claude CLI prompt (see Task 3 for prompt construction)
3. Spawn: `claude --dangerously-skip-permissions --output-format stream-json -p "<prompt>"` in the project cwd
4. Parse stdout for progress, update meta.json status to "generating"
5. When complete, write the HTML output, update status to "completed"
6. On error, update status to "failed" with error message

**read():** Read meta.json + guide.html for the given guideId.

**remove():** Delete the guide directory.

**regenerate():** Read existing meta, delete old HTML, re-run generate with same params.

Active generations tracked in a `Map<GuideId, AbortController>` to allow cancellation.

**Step 3: Commit**

```bash
git add apps/server/src/guideManager.ts apps/server/src/config.ts
git commit -m "feat: add GuideManager service for guide lifecycle and CLI spawning"
```

---

## Task 3: Server — Prompt Construction Module

**Files:**

- Create: `apps/server/src/guidePrompts.ts`

This module builds the prompts sent to the `claude` CLI based on the guide scope and depth.

**Key responsibilities:**

- For **full project** scope: Use the full codebase-to-course SKILL.md prompt, instructing Claude to analyze the entire project and generate a 5-8 module interactive course
- For **directory** scope: Adapted prompt focusing analysis on a specific directory/subsystem
- For **single file** scope: Lighter prompt explaining one file's purpose, logic, and connections
- For **topic** scope: Claude receives the freeform topic query (e.g., "How does WebSocket reconnection work?") and is instructed to explore the codebase to find all relevant files/modules, then generate a guide focused specifically on that topic. The prompt should say: "The user wants to learn about: {topicQuery}. Explore the codebase at {projectCwd} to find all files relevant to this topic, then generate an interactive guide explaining how it works." The title is auto-derived from the topic (e.g., "WebSocket Reconnection" from "How does WebSocket reconnection work?")
- For **quick** depth: Simplified prompt that generates a shorter, markdown-style HTML (no animations/quizzes, just code translations and explanations)
- For **full** depth: The complete codebase-to-course treatment with all interactive elements

The prompt templates should be adapted from the reference project files:

- `/Users/alesloas/Downloads/codebase-to-course-main/SKILL.md` — main skill instructions
- `/Users/alesloas/Downloads/codebase-to-course-main/references/design-system.md` — CSS design system
- `/Users/alesloas/Downloads/codebase-to-course-main/references/interactive-elements.md` — interactive element patterns

The function signature:

```typescript
export function buildGuidePrompt(params: {
  scope: GuideScope;
  depth: GuideDepth;
  projectCwd: string;
  targetPath: string;
  topicQuery: string | null;
  projectName: string;
}): string;
```

The prompt must instruct Claude to:

1. Write a single self-contained HTML file
2. Save it to a specific output path (passed as parameter)
3. Use agents for parallel analysis when scope is "project"
4. Follow the design system and interactive element specs

**Step 1: Create the prompt builder**

Build the prompt templates as template literals. The full prompt for a "full/project" guide will be large (include the design system and interactive elements inline). For "quick" guides, use a much shorter prompt focused on code explanation.

**Step 2: Commit**

```bash
git add apps/server/src/guidePrompts.ts
git commit -m "feat: add prompt construction for guide generation"
```

---

## Task 4: Server — Wire Guide WS Methods

**Files:**

- Modify: `apps/server/src/wsServer.ts` (add route cases, inject GuideManager, add HTTP route for serving guide HTML)

**Step 1: Add GuideManager to the server's service layer composition**

In the server setup (where other services like GitManager, TerminalManager are composed), add GuideManager.

**Step 2: Add WS method routing in `routeRequest`**

For each new WS method, add a case to the switch:

```typescript
case WS_METHODS.guideList: {
  const body = stripRequestTag(request.body);
  return yield* Effect.promise(() => guideManager.list(body));
}
case WS_METHODS.guideGenerate: {
  const body = stripRequestTag(request.body);
  return yield* Effect.promise(() =>
    guideManager.generate(body, (event) => {
      void Effect.runPromise(
        pushBus.publishAll(WS_CHANNELS.guideProgress, event),
      );
    }),
  );
}
case WS_METHODS.guideRead: {
  const body = stripRequestTag(request.body);
  return yield* Effect.promise(() => guideManager.read(body));
}
case WS_METHODS.guideDelete: {
  const body = stripRequestTag(request.body);
  return yield* Effect.promise(() => guideManager.remove(body));
}
case WS_METHODS.guideRegenerate: {
  const body = stripRequestTag(request.body);
  return yield* Effect.promise(() =>
    guideManager.regenerate(body, (event) => {
      void Effect.runPromise(
        pushBus.publishAll(WS_CHANNELS.guideProgress, event),
      );
    }),
  );
}
```

**Step 3: Add HTTP endpoint for serving guide HTML**

In the HTTP server handler, add a route to serve guide HTML files directly (for iframe `src`):

```typescript
// Route: /guides/{guideId}/view
if (url.pathname.startsWith("/guides/") && url.pathname.endsWith("/view")) {
  const guideId = url.pathname.split("/")[2];
  // Read HTML file from guidesDir/{guideId}/guide.html
  // Serve with Content-Type: text/html
  // Cache-Control: no-cache (content may be regenerated)
}
```

This endpoint is what the iframe `src` will point to.

**Step 4: Run typecheck**

Run: `bun typecheck`
Expected: PASS (exhaustive switch should now be satisfied)

**Step 5: Commit**

```bash
git add apps/server/src/wsServer.ts
git commit -m "feat: wire guide WS methods and HTTP serving endpoint"
```

---

## Task 5: Web — Guide Store and API Wiring

**Files:**

- Create: `apps/web/src/guideStore.ts`
- Modify: `apps/web/src/wsNativeApi.ts` (add guides namespace)

**Step 1: Wire guides API in wsNativeApi.ts**

Add to the `api` object inside `createWsNativeApi()`:

```typescript
guides: {
  list: (input) => transport.request(WS_METHODS.guideList, input),
  generate: (input) => transport.request(WS_METHODS.guideGenerate, input, { timeoutMs: null }),
  read: (input) => transport.request(WS_METHODS.guideRead, input),
  delete: (input) => transport.request(WS_METHODS.guideDelete, input),
  regenerate: (input) => transport.request(WS_METHODS.guideRegenerate, input, { timeoutMs: null }),
  onProgress: (callback) =>
    transport.subscribe(WS_CHANNELS.guideProgress, (message) => callback(message.data)),
},
```

Add the `guideProgress` channel subscription alongside the other channel subscriptions.

**Step 2: Create guideStore.ts**

Zustand store for guide UI state:

```typescript
import { create } from "zustand";
import type { GuideMeta, GuideProgressEvent } from "@t3tools/contracts";

interface GuideStore {
  /** All known guide metadata, keyed by guideId */
  guides: Map<string, GuideMeta>;
  /** Active generation progress events */
  activeGenerations: Map<string, GuideProgressEvent>;
  /** Currently selected guide ID for viewing */
  selectedGuideId: string | null;
  /** Whether the guides sidebar tab is active */
  guidesTabActive: boolean;

  // Actions
  setGuides: (guides: GuideMeta[]) => void;
  upsertGuide: (guide: GuideMeta) => void;
  removeGuide: (guideId: string) => void;
  updateProgress: (event: GuideProgressEvent) => void;
  selectGuide: (guideId: string | null) => void;
  setGuidesTabActive: (active: boolean) => void;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/guideStore.ts apps/web/src/wsNativeApi.ts
git commit -m "feat: add guide store and WS API wiring on web client"
```

---

## Task 6: Web — Guides Sidebar Tab

**Files:**

- Create: `apps/web/src/components/GuidesSidebar.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx` (add tab toggle between Threads and Guides views)

**Step 1: Add tab toggle to Sidebar**

At the top of the sidebar (in `SidebarHeader` or just below it), add a simple two-tab toggle:

```
[Chat icon] [Book icon]
```

- Chat icon (default): Shows the existing threads/projects view
- Book icon: Shows the guides view (renders `<GuidesSidebar />`)

Use the `guidesTabActive` state from guideStore. The toggle is two icon buttons, the active one gets a subtle highlight (matching existing sidebar styling patterns).

**Step 2: Create GuidesSidebar.tsx**

This component mirrors the thread sidebar structure but for guides:

```
GUIDES                        ↻  +
▾ 📁 server
    Full Project Guide          2d ago
    wsServer.ts Quick Explain   5h ago
▾ 📁 t3code
    Architecture Course         1d ago
▾ 🎨 storybud-app
    (no guides yet)
```

**Structure:**

- Groups guides by `projectCwd` matching against the projects from the main store
- Each project section is collapsible (same `Collapsible` pattern as threads)
- Each guide row shows: depth indicator (quick/full icon), title, relative time
- Status indicators: spinner for "generating", checkmark for "completed", X for "failed"
- "+" button in header opens the scope picker dialog (Task 7)
- "↻" button refreshes the guide list

**Context menu on guide row:**

```typescript
const items = [
  { id: "view", label: "View guide" },
  { id: "regenerate", label: "Regenerate" },
  { id: "delete", label: "Delete", destructive: true },
];
```

**Context menu on project header (in guides view):**

```typescript
const items = [{ id: "new-guide", label: "New guide for this project" }];
```

**Step 3: Commit**

```bash
git add apps/web/src/components/GuidesSidebar.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat: add guides sidebar tab with project-grouped guide list"
```

---

## Task 7: Web — Scope Picker Dialog

**Files:**

- Create: `apps/web/src/components/GuideGenerateDialog.tsx`

**Step 1: Create the dialog component**

A modal dialog that lets the user configure a new guide:

```
┌─────────────────────────────────────┐
│  Generate Guide                     │
│                                     │
│  Project: [server ▾]                │
│                                     │
│  Scope:                             │
│  ○ Full Project                     │
│  ○ Directory                        │
│  ○ Single File                      │
│  ○ Specific Topic                   │
│                                     │
│  [Target path input]  (if dir/file) │
│  (with file browser / autocomplete) │
│                                     │
│  [Topic input]  (if topic)          │
│  "e.g. How does WebSocket           │
│   reconnection work?"               │
│                                     │
│  Depth:                             │
│  ○ Quick Explain                    │
│  ○ Full Interactive Course          │
│                                     │
│  [Cancel]            [Generate]     │
└─────────────────────────────────────┘
```

- **Project dropdown**: Lists all projects from the main store
- **Scope radio**: Four options.
  - "Full Project" hides path and topic inputs
  - "Directory" / "Single File" show the target path input
  - "Specific Topic" shows a freeform text input where the user describes what they want to learn about (e.g., "How does the authentication flow work?", "The WebSocket reconnection logic", "How are terminal sessions managed?"). Claude will find the relevant files itself and generate a guide focused on that topic. The guide title is auto-derived from the topic query.
- **Target path**: Text input with autocomplete using `projects.searchEntries` or `projects.listEntries` APIs. Shows when scope is "directory" or "file"
- **Topic input**: Freeform text area. Shows when scope is "topic". Placeholder: "What do you want to learn about?"
- **Depth toggle**: Quick vs Full
- **Generate button**: Calls `api.guides.generate()` and closes the dialog

Pre-populate project when opened from a project context menu.
Pre-populate target path when opened from a file/folder context menu.

**Step 2: Commit**

```bash
git add apps/web/src/components/GuideGenerateDialog.tsx
git commit -m "feat: add guide generation scope picker dialog"
```

---

## Task 8: Web — Context Menu Integration

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx` (add "Generate Guide" to project context menu)
- Modify: `apps/web/src/components/chat/FileBrowserPopover.tsx` (add "Learn About This" to file/folder context menu)

**Step 1: Add to project context menu in Sidebar.tsx**

In `handleProjectContextMenu`, add a new menu item:

```typescript
{ id: "generate-guide", label: "Generate Guide" },
```

When clicked, open the `GuideGenerateDialog` pre-populated with the project's `cwd`.

**Step 2: Add to file browser context menu**

In `showEntryContextMenu` in `FileBrowserPopover.tsx`, add:

```typescript
{ id: "learn-about", label: "Learn About This" },
```

For directories: opens dialog with scope="directory" and targetPath pre-filled.
For files: opens dialog with scope="file" and targetPath pre-filled.

**Step 3: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/components/chat/FileBrowserPopover.tsx
git commit -m "feat: add guide generation to project and file context menus"
```

---

## Task 9: Web — Guide Viewer Panel

**Files:**

- Create: `apps/web/src/components/GuideViewer.tsx`
- Modify: `apps/web/src/routes/_chat.tsx` or create `apps/web/src/routes/_chat.guide.$guideId.tsx`

**Step 1: Create GuideViewer.tsx**

An iframe-based viewer that loads the guide HTML from the server's HTTP endpoint:

```typescript
function GuideViewer({ guideId }: { guideId: string }) {
  // Construct the iframe src URL
  const src = `/guides/${guideId}/view`;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar with guide title, back button, regenerate button */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <button onClick={goBack}>
          <ArrowLeftIcon className="size-4" />
        </button>
        <span className="flex-1 truncate text-sm font-medium">{guide.title}</span>
        <button onClick={regenerate}>
          <RefreshCwIcon className="size-4" />
        </button>
      </div>

      {/* Iframe */}
      <iframe
        src={src}
        className="flex-1 border-0"
        title={guide.title}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
```

**Step 2: Route integration**

Option A (recommended): Create a new route `_chat.guide.$guideId.tsx` that renders the viewer as the main content area (replacing the chat view when a guide is selected).

Option B: Render as an overlay/panel on top of the chat view.

Option A is cleaner — clicking a guide in the sidebar navigates to `/guide/{guideId}`, and the back button returns to the chat.

**Step 3: Commit**

```bash
git add apps/web/src/components/GuideViewer.tsx apps/web/src/routes/_chat.guide.$guideId.tsx
git commit -m "feat: add iframe-based guide viewer with route integration"
```

---

## Task 10: Server — Guide Generation Progress Streaming

**Files:**

- Modify: `apps/server/src/guideManager.ts` (refine progress parsing)

**Step 1: Implement progress parsing from Claude CLI output**

When the `claude` CLI is spawned with `--output-format stream-json`, it emits JSON objects on stdout. Parse these to extract progress:

- Look for assistant messages that indicate phase transitions ("Analyzing codebase...", "Building module N...")
- Emit `GuideProgressEvent` with estimated percentages
- On process exit code 0: read the generated HTML file, update meta to "completed"
- On non-zero exit: update meta to "failed" with stderr content

The claude CLI stream-json format emits objects like:

```json
{"type": "assistant", "message": "...", "session_id": "..."}
{"type": "result", "result": "...", "session_id": "..."}
```

Parse the `message` field for progress indicators.

**Step 2: Commit**

```bash
git add apps/server/src/guideManager.ts
git commit -m "feat: implement progress streaming for guide generation"
```

---

## Task 11: Web — Progress Indicators

**Files:**

- Modify: `apps/web/src/components/GuidesSidebar.tsx` (show generation progress)

**Step 1: Subscribe to guide progress events**

In the guides sidebar (or at the app level), subscribe to the `guideProgress` push channel:

```typescript
useEffect(() => {
  const api = readNativeApi();
  if (!api) return;
  return api.guides.onProgress((event) => {
    guideStore.getState().updateProgress(event);
    if (event.updatedMeta) {
      guideStore.getState().upsertGuide(event.updatedMeta);
    }
  });
}, []);
```

**Step 2: Show progress in guide rows**

For guides with active generation:

- Replace the time display with a progress message
- Show a spinner or progress bar
- When complete, transition to the normal display

**Step 3: Commit**

```bash
git add apps/web/src/components/GuidesSidebar.tsx
git commit -m "feat: add real-time progress indicators for guide generation"
```

---

## Task 12: Integration Testing and Polish

**Step 1: Run full typecheck**

Run: `bun typecheck`
Expected: PASS

**Step 2: Run lint and format**

Run: `bun fmt && bun lint`
Fix any issues.

**Step 3: Manual testing checklist**

- [ ] Guides tab appears in sidebar with book icon
- [ ] Clicking "+" opens scope picker dialog
- [ ] Project dropdown lists all projects
- [ ] Scope radio toggles target path input visibility
- [ ] "Generate" spawns claude CLI and guide appears in sidebar with spinner
- [ ] Progress updates appear in real-time
- [ ] Completed guide is viewable by clicking it
- [ ] Guide HTML renders correctly in iframe
- [ ] Context menu on project shows "Generate Guide"
- [ ] Context menu on file/folder shows "Learn About This"
- [ ] Regenerate works on existing guides
- [ ] Delete removes guide from list and disk
- [ ] Guides persist across server restarts
- [ ] Mobile: Guide viewer is full-screen, back button works

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: polish and integration test fixes for guides feature"
```

---

## File Summary

| File                                                  | Action | Description                                     |
| ----------------------------------------------------- | ------ | ----------------------------------------------- |
| `packages/contracts/src/baseSchemas.ts`               | Modify | Add `GuideId`                                   |
| `packages/contracts/src/guide.ts`                     | Create | Guide domain schemas                            |
| `packages/contracts/src/ws.ts`                        | Modify | Add guide WS methods, channel, push schema      |
| `packages/contracts/src/ipc.ts`                       | Modify | Add guides to NativeApi                         |
| `packages/contracts/src/index.ts`                     | Modify | Re-export guide module                          |
| `apps/server/src/config.ts`                           | Modify | Add `guidesDir` to derived paths                |
| `apps/server/src/guideManager.ts`                     | Create | Guide lifecycle + CLI spawning                  |
| `apps/server/src/guidePrompts.ts`                     | Create | Prompt construction for different scopes/depths |
| `apps/server/src/wsServer.ts`                         | Modify | Route guide WS methods + HTTP endpoint          |
| `apps/web/src/wsNativeApi.ts`                         | Modify | Wire guide API methods                          |
| `apps/web/src/guideStore.ts`                          | Create | Zustand store for guide state                   |
| `apps/web/src/components/GuidesSidebar.tsx`           | Create | Guides sidebar tab content                      |
| `apps/web/src/components/GuideGenerateDialog.tsx`     | Create | Scope picker dialog                             |
| `apps/web/src/components/GuideViewer.tsx`             | Create | Iframe viewer component                         |
| `apps/web/src/components/Sidebar.tsx`                 | Modify | Add tab toggle + context menu item              |
| `apps/web/src/components/chat/FileBrowserPopover.tsx` | Modify | Add "Learn About This" context menu             |
| `apps/web/src/routes/_chat.guide.$guideId.tsx`        | Create | Guide viewer route                              |

## Dependency Order

```
Task 1 (Contracts) ──→ Task 2 (GuideManager) ──→ Task 3 (Prompts) ──→ Task 4 (WS wiring)
                                                                              │
Task 5 (Store + API) ←─────────────────────────────────────────────────────────┘
     │
     ├──→ Task 6 (Guides Sidebar)
     ├──→ Task 7 (Scope Picker Dialog)
     ├──→ Task 8 (Context Menu Integration)
     └──→ Task 9 (Guide Viewer)
              │
Task 10 (Progress Streaming) ──→ Task 11 (Progress UI)
              │
Task 12 (Polish)
```

Tasks 6, 7, 8, 9 can be parallelized after Task 5.
Tasks 10-11 can be done in parallel with Tasks 6-9.
