# Local CLI Session Integration — Important Context

## Critical Information

- **JSONL format reference**: `/Volumes/Code/GitHub/zed/_docs/agent-panel-features-breakdown.md` has the definitive spec for both Claude Code and Codex session file formats. Read this before implementing the scanner.
- **Claude Code folder encoding**: Replace ALL non-alphanumeric characters with `-` in the absolute path. E.g., `/Volumes/Code/GitHub/t3code` becomes `-Volumes-Code-GitHub-t3code`.
- **Claude vs Codex message format differences**:
  - Claude: user `message.content` is a **plain string**; assistant `message.content` is an **array** of `{type:"text", text:string}` blocks
  - Codex: both user and assistant use `type === "response_item"` with `payload.content` as an array; user uses `input_text` blocks, assistant uses `output_text` blocks
- **The WebSocketRequestBody union uses a discriminated union pattern** via `tagRequestBody()` helper. The `_tag` field is the method name. Every new WS method MUST be added to this union or the exhaustive switch in `wsServer.ts` will fail to compile.
- **Effect-TS pattern**: The server uses Effect monad throughout. WS handlers use `yield*` with Effect. For the scanner module, we use plain `async/await` with `Effect.tryPromise` wrapper in the handler — same pattern as skills file operations.

## Caveats

- The `routeRequest` switch in `wsServer.ts` has an exhaustive `default: never` check. If you add a method to `WS_METHODS` and the `WebSocketRequestBody` union but forget the handler case, it won't compile.
- Claude Code's `sessions-index.json` is optional — may not exist. Fall back to scanning `.jsonl` files directly.
- Codex session files are nested in date directories (`YYYY/MM/DD/`). Need recursive scanning.
- `session-names.json` (Claude) stores custom user-given names. These override `firstPrompt` from the index.
- The `thread.imported` event handlers in projector and ProjectionPipeline are nearly identical to `thread.cloned`. Copy those handlers and adjust field names.
- The `OrchestrationEventType` is a **hardcoded** `Schema.Literals` array separate from the event union. MUST add `"thread.imported"` there too or the EventStore validation fails (we learned this with `thread.cloned`).
- `thread.import` command messages use a simplified schema (`{ role, text }`) — the decider maps them to full `OrchestrationMessage` with generated IDs, null turnId, false streaming, and timestamps.

## Dependencies

- `node:fs/promises` — for async file operations in scanner
- `node:readline` — for streaming JSONL line-by-line (large file handling)
- `node:os` — for `os.homedir()`
- `node:path` — for path manipulation
- `@tanstack/react-query` — for caching scan results on the client (already in web app dependencies)
- `lucide-react` — for icons (already in web app dependencies)
- `@tanstack/react-router` — for the new route (already in web app dependencies)

No new external dependencies needed.

## Testing Notes

### Type checking
```bash
bun typecheck  # Must pass all 7 packages
```

### Lint + Format
```bash
bun lint   # No warnings
bun fmt    # Clean
```

### Unit Tests
```bash
bun run test  # Existing tests must still pass
```

### Manual Testing Checklist
1. Sidebar: "Local Sessions" section appears collapsed under each project
2. Expand: shows Claude/Codex tabs
3. Tab switching works, active tab highlighted
4. If `~/.claude/projects/` doesn't exist: Claude tab shows "Not available" message
5. If `~/.codex/sessions/` doesn't exist: Codex tab shows "Not available" message
6. If sessions exist: listed with title and relative timestamp
7. Refresh button: re-scans and updates list
8. Click session: navigates to read-only view with all messages
9. Read-only view: shows banner with source icon, title, "Fork to T3 Code" button
10. Fork button: creates native thread, navigates to it, all messages present
11. Right-click session in sidebar: "Fork to T3 Code" context menu item works
12. Corrupt JSONL files: scanner skips bad lines, doesn't crash
13. Empty session folder: shows "No sessions" (not an error)
14. Very long session (1000+ messages): renders without hanging

## Known Limitations (v1)

- No continuous file watching — manual refresh only
- No tracking of which sessions have been forked (can fork same session multiple times)
- No session search/filtering within the Local Sessions section
- No attachment support when forking (text only)
- Codex session matching by project path may not work perfectly if the session index doesn't contain project paths
- 2000 message cap on reading — extremely long sessions will be truncated
- No custom icons for Claude/Codex — using generic lucide-react icons for v1

## Related Files

- `/Volumes/Code/GitHub/zed/_docs/agent-panel-features-breakdown.md` — JSONL format spec
- `/Users/alesloas/.claude/plans/wobbly-moseying-gizmo.md` — Claude Code plan file (approved)
- `/Volumes/Code/GitHub/t3code/.plans/add-local-chat-history/plans.md` — This feature's implementation plan
- `/Volumes/Code/GitHub/t3code/.plans/add-local-chat-history/task.md` — Task progress tracker

## Recovery Instructions

If resuming after compaction:
1. Read this file first for caveats and gotchas
2. Check `task.md` for current progress and RESUME HERE marker
3. Read `plans.md` for full technical context and code snippets
4. Read the approved plan at `/Users/alesloas/.claude/plans/wobbly-moseying-gizmo.md`
5. Check `git status` for any uncommitted work
6. Reference `/Volumes/Code/GitHub/zed/_docs/agent-panel-features-breakdown.md` for JSONL format details
