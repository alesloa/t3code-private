# Compact Now Button — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Compact now" button to the context window meter popover that sends `/compact` as a user turn for Claude sessions.

**Architecture:** The ContextWindowMeter popover gains a button that dispatches a `thread.turn.start` command with `/compact` as input text. This flows through the existing orchestration → ClaudeAdapter → SDK prompt queue pipeline. Claude Code CLI recognizes `/compact` and triggers context compaction. The button is only visible for Claude provider sessions and disabled while a turn is running.

**Tech Stack:** React, existing orchestration dispatch, existing ContextWindowMeter component

---

### Task 1: Add provider and state props to ContextWindowMeter

**Files:**

- Modify: `apps/web/src/components/chat/ContextWindowMeter.tsx`

**Step 1: Add new props to ContextWindowMeter**

Add `provider`, `threadId`, `isWorking`, and `onCompact` props:

```tsx
import type { ProviderKind } from "@t3tools/contracts";

export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  provider?: ProviderKind;
  isWorking?: boolean;
  onCompact?: () => void;
}) {
```

**Step 2: Run typecheck to verify no breakage**

Run: `bun typecheck`
Expected: PASS (new props are all optional)

**Step 3: Commit**

```
feat: add provider/state props to ContextWindowMeter
```

---

### Task 2: Render the Compact now button in the popover

**Files:**

- Modify: `apps/web/src/components/chat/ContextWindowMeter.tsx`

**Step 1: Add the compact button below the auto-compact message**

After the `compactsAutomatically` div (line 109), add:

```tsx
{
  props.provider === "claudeAgent" && props.onCompact ? (
    <button
      type="button"
      disabled={props.isWorking}
      onClick={(e) => {
        e.stopPropagation();
        props.onCompact?.();
      }}
      className="mt-1 rounded px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
    >
      Compact now
    </button>
  ) : null;
}
```

**Step 2: Run typecheck**

Run: `bun typecheck`
Expected: PASS

**Step 3: Run lint and format**

Run: `bun fmt && bun lint`
Expected: PASS

**Step 4: Commit**

```
feat: render compact now button in context window popover
```

---

### Task 3: Wire the compact action in ChatView

**Files:**

- Modify: `apps/web/src/components/ChatView.tsx`

**Step 1: Create the onCompact callback and pass props to ContextWindowMeter**

Find the ContextWindowMeter usage (~line 3998):

```tsx
{
  activeContextWindow ? <ContextWindowMeter usage={activeContextWindow} /> : null;
}
```

Replace with:

```tsx
{
  activeContextWindow ? (
    <ContextWindowMeter
      usage={activeContextWindow}
      provider={selectedProvider}
      isWorking={isWorking}
      onCompact={
        selectedProvider === "claudeAgent" && activeThreadId
          ? () => {
              const api = readNativeApi();
              if (!api || !activeThreadId) return;
              api.orchestration.dispatchCommand({
                type: "thread.turn.start",
                commandId: newCommandId(),
                threadId: activeThreadId,
                message: {
                  messageId: newMessageId(),
                  role: "user",
                  text: "/compact",
                  attachments: [],
                },
                modelSelection: selectedModelSelection,
                runtimeMode,
                interactionMode,
                createdAt: new Date().toISOString(),
              });
            }
          : undefined
      }
    />
  ) : null;
}
```

**Step 2: Run typecheck**

Run: `bun typecheck`
Expected: PASS

**Step 3: Run lint and format**

Run: `bun fmt && bun lint`
Expected: PASS

**Step 4: Commit**

```
feat: wire compact now button to dispatch /compact turn
```

---

### Task 4: Final verification

**Step 1: Run all checks**

Run: `bun fmt && bun lint && bun typecheck`
Expected: All PASS

**Step 2: Commit if any fixes needed**

```
chore: fix lint/format issues
```
