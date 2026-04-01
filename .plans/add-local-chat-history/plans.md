# Local CLI Session Integration — Implementation Plan

## Status: IN_PROGRESS
## Last Updated: 2026-03-29

## Goal
Allow users to see Claude Code and Codex CLI sessions (stored locally on disk) in the T3 Code sidebar, view them read-only, and fork them into native T3 Code threads.

## Context
T3 Code only shows threads created through its own orchestration system. Users also run Claude Code CLI (`~/.claude/projects/`) and Codex CLI (`~/.codex/sessions/`) locally, and want to see those conversations alongside T3 Code threads. The JSONL formats for both CLI tools are documented in `/Volumes/Code/GitHub/zed/_docs/agent-panel-features-breakdown.md`.

## Technical Approach

**Server-side scanning**: A new stateless module `cliSessionScanner.ts` reads CLI session files on demand via two new WS methods. No continuous scanning — manual refresh button only.

**Sidebar UI**: Collapsible "Local Sessions" section under each project (always shown, collapsed by default). Two tabs: "Claude" and "Codex" (always both visible; shows "Not available" if CLI not installed). Refresh button next to tabs.

**Read-only view**: New lightweight route `/_chat/cli-session` renders messages without the full ChatView complexity. Top banner with "Fork to T3 Code" button.

**Fork/Import**: New `thread.import` orchestration command accepts messages in the payload and creates a native thread. Follows the `thread.clone` pattern but without requiring a source thread in the read model.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `packages/contracts/src/cliSessions.ts` | CLI session types and schemas |
| EDIT   | `packages/contracts/src/index.ts` | Add cliSessions export |
| EDIT   | `packages/contracts/src/ws.ts` | Add WS method constants + request body entries |
| EDIT   | `packages/contracts/src/ipc.ts` | Add `cliSessions` to NativeApi interface |
| EDIT   | `packages/contracts/src/orchestration.ts` | Add ThreadImportCommand, ThreadImportedPayload, event type |
| CREATE | `apps/server/src/cliSessionScanner.ts` | Server-side scanner module |
| EDIT   | `apps/server/src/wsServer.ts` | Add route cases for scan + readMessages |
| EDIT   | `apps/server/src/orchestration/Schemas.ts` | Re-export ThreadImportedPayload |
| EDIT   | `apps/server/src/orchestration/decider.ts` | Add `thread.import` command case |
| EDIT   | `apps/server/src/orchestration/projector.ts` | Add `thread.imported` event case |
| EDIT   | `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` | Add `thread.imported` projection cases |
| EDIT   | `apps/web/src/wsNativeApi.ts` | Add cliSessions API methods |
| CREATE | `apps/web/src/routes/_chat.cli-session.tsx` | CLI session view route |
| CREATE | `apps/web/src/components/CliSessionView.tsx` | Read-only session viewer |
| CREATE | `apps/web/src/components/CliSessionsSidebar.tsx` | Sidebar "Local Sessions" section |
| EDIT   | `apps/web/src/components/Sidebar.tsx` | Render CliSessionsSidebar per project |

## Code Snippets

### Contract Schemas (`packages/contracts/src/cliSessions.ts`)

```typescript
import { Schema } from "effect";

export const CliSessionSource = Schema.Literal("claude", "codex");
export type CliSessionSource = typeof CliSessionSource.Type;

export const CliSessionMeta = Schema.Struct({
  id: Schema.String,
  source: CliSessionSource,
  title: Schema.String,
  filePath: Schema.String,
  messageCount: Schema.optional(Schema.Number),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type CliSessionMeta = typeof CliSessionMeta.Type;

export const CliSessionScanInput = Schema.Struct({
  cwd: Schema.optional(Schema.String),
});
export type CliSessionScanInput = typeof CliSessionScanInput.Type;

export const CliSessionScanResult = Schema.Struct({
  claude: Schema.Struct({
    available: Schema.Boolean,
    sessions: Schema.Array(CliSessionMeta),
  }),
  codex: Schema.Struct({
    available: Schema.Boolean,
    sessions: Schema.Array(CliSessionMeta),
  }),
});
export type CliSessionScanResult = typeof CliSessionScanResult.Type;

export const CliSessionMessage = Schema.Struct({
  role: Schema.Literal("user", "assistant"),
  text: Schema.String,
  timestamp: Schema.optional(Schema.String),
});
export type CliSessionMessage = typeof CliSessionMessage.Type;

export const CliSessionReadMessagesInput = Schema.Struct({
  source: CliSessionSource,
  filePath: Schema.String,
});
export type CliSessionReadMessagesInput = typeof CliSessionReadMessagesInput.Type;

export const CliSessionReadMessagesResult = Schema.Struct({
  messages: Schema.Array(CliSessionMessage),
});
export type CliSessionReadMessagesResult = typeof CliSessionReadMessagesResult.Type;
```

### WS Methods Addition (`packages/contracts/src/ws.ts`)

```typescript
// Add to WS_METHODS object:
cliSessionsScan: "cliSessions.scan",
cliSessionsReadMessages: "cliSessions.readMessages",

// Add to WebSocketRequestBody union (after guide methods):
tagRequestBody(WS_METHODS.cliSessionsScan, CliSessionScanInput),
tagRequestBody(WS_METHODS.cliSessionsReadMessages, CliSessionReadMessagesInput),
```

### NativeApi Addition (`packages/contracts/src/ipc.ts`)

```typescript
// Add after guides section:
cliSessions: {
  scan: (input: CliSessionScanInput) => Promise<CliSessionScanResult>;
  readMessages: (input: CliSessionReadMessagesInput) => Promise<CliSessionReadMessagesResult>;
};
```

### ThreadImportCommand (`packages/contracts/src/orchestration.ts`)

```typescript
const ThreadImportCommand = Schema.Struct({
  type: Schema.Literal("thread.import"),
  commandId: CommandId,
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  messages: Schema.Array(Schema.Struct({
    role: OrchestrationMessageRole,
    text: Schema.String,
  })),
  createdAt: IsoDateTime,
});

export const ThreadImportedPayload = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  messages: Schema.Array(OrchestrationMessage),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
```

### Scanner Module Key Logic (`apps/server/src/cliSessionScanner.ts`)

**Claude folder name encoding:**
```typescript
function cwdToClaudeFolderName(cwd: string): string {
  return cwd.split("").map(c => /[a-zA-Z0-9]/.test(c) ? c : "-").join("");
}
```

**Claude message extraction:**
```typescript
// type === "user" → message.content is a plain string
// type === "assistant" → message.content is array of {type:"text", text:string}
function extractClaudeText(parsed: any): string {
  const content = parsed.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text).join("\n");
  }
  return "";
}
```

**Codex message extraction:**
```typescript
// type === "response_item" with payload.role
// User: input_text blocks, Assistant: output_text blocks
function extractCodexText(parsed: any): string {
  const content = parsed.payload?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(b => b.type === "input_text" || b.type === "output_text")
    .map(b => b.text)
    .join("\n");
}
```

**Security validation:**
```typescript
function validateFilePath(filePath: string): void {
  const home = os.homedir();
  if (!filePath.startsWith(path.join(home, ".claude/")) &&
      !filePath.startsWith(path.join(home, ".codex/"))) {
    throw new Error("File path must be under ~/.claude/ or ~/.codex/");
  }
}
```

### WS Handler Pattern (`apps/server/src/wsServer.ts`)

```typescript
case WS_METHODS.cliSessionsScan: {
  const body = stripRequestTag(request.body);
  return yield* Effect.tryPromise({
    try: () => cliSessionScanner.scanCliSessions(body),
    catch: (cause) =>
      new RouteRequestError({ message: `Failed to scan CLI sessions: ${String(cause)}` }),
  });
}
```

### Decider Pattern (`apps/server/src/orchestration/decider.ts`)

```typescript
case "thread.import": {
  yield* requireProject({ readModel, command, projectId: command.projectId });
  yield* requireThreadAbsent({ readModel, command, threadId: command.threadId });
  const now = nowIso();
  return {
    ...withEventBase({
      aggregateKind: "thread",
      aggregateId: command.threadId,
      occurredAt: command.createdAt,
      commandId: command.commandId,
    }),
    type: "thread.imported",
    payload: {
      threadId: command.threadId,
      projectId: command.projectId,
      title: command.title,
      modelSelection: command.modelSelection,
      runtimeMode: command.runtimeMode,
      interactionMode: command.interactionMode,
      messages: command.messages.map((m) =>
        Object.assign({}, {
          id: crypto.randomUUID(),
          role: m.role,
          text: m.text,
          turnId: null,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      createdAt: command.createdAt,
      updatedAt: command.createdAt,
    },
  };
}
```

### Client Fork Logic

```typescript
async function forkCliSession(session: CliSessionMeta, messages: CliSessionMessage[], projectId: ProjectId) {
  const threadId = newThreadId();
  await api.orchestration.dispatchCommand({
    type: "thread.import",
    commandId: newCommandId(),
    threadId,
    projectId,
    title: `Imported: ${session.title}`,
    modelSelection: { provider: "codex", model: "o4-mini" },
    runtimeMode: "full-access",
    interactionMode: "default",
    messages: messages.map(m => ({ role: m.role, text: m.text })),
    createdAt: new Date().toISOString(),
  });
  navigate({ to: "/$threadId", params: { threadId } });
}
```

## Integration Points

- **WS method registration**: Follow `tagRequestBody` pattern in `packages/contracts/src/ws.ts:184`
- **Server handler**: `routeRequest` switch in `apps/server/src/wsServer.ts:770`
- **NativeApi client**: `apps/web/src/wsNativeApi.ts` transport.request pattern
- **Orchestration event flow**: Command → Decider → Event → Projector → ProjectionPipeline
- **Sidebar insertion point**: After `<SidebarMenuSub>` at ~line 1461 of `Sidebar.tsx`
- **Route registration**: `apps/web/src/routes/_chat.cli-session.tsx` auto-discovered by TanStack Router
- **Existing helpers to reuse**:
  - `newThreadId()`, `newCommandId()`, `newMessageId()` from `apps/web/src/lib/utils.ts`
  - `formatRelativeTime()` from Sidebar.tsx
  - `toastManager.add()` for error feedback
  - `ToggleGroup`/`Toggle` from `apps/web/src/components/ui/toggle-group.tsx`
  - `Collapsible`/`CollapsibleContent` from `apps/web/src/components/ui/collapsible.tsx`
  - `SidebarMenuSub`/`SidebarMenuSubItem`/`SidebarMenuSubButton` from sidebar UI

## Decisions Made

1. **Server-side scanning** over client-side: Server has filesystem access, avoids multiple round trips, clean API boundary
2. **Separate CliSessionView** over reusing ChatView: ChatView is 4400 lines deeply coupled to orchestration state. A lightweight component is far simpler for v1
3. **`thread.import` command** over reusing `thread.clone`: Clone requires a source thread in the read model. Import accepts messages directly in the payload
4. **react-query** over Zustand for CLI session state: Data is ephemeral (from disk), no need to persist to localStorage
5. **Always show both tabs** with "Not available" state: User always knows the feature exists even if one CLI isn't installed
6. **Manual refresh** over file watching: Saves resources, user has explicit control
7. **2000 message cap**: Prevents performance issues with extremely long conversations
8. **File path validation**: Security measure to prevent arbitrary file reads via the WS method
