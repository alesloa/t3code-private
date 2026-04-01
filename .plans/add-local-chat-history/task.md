# Local CLI Session Integration — Tasks

## Current Status: Implementation complete, pending manual testing

## Completed
- [x] Design brainstorming — agreed on approach with user
- [x] Codebase exploration — mapped WS method patterns, sidebar structure, store, routes, orchestration flow
- [x] Plan written and approved
- [x] Step 1 — Contracts: CLI Session Types
  - [x] Create `packages/contracts/src/cliSessions.ts` with all schemas
  - [x] Add export to `packages/contracts/src/index.ts`
- [x] Step 2 — Contracts: WS Methods + Request Body
  - [x] Add `cliSessionsScan` and `cliSessionsReadMessages` to `WS_METHODS`
  - [x] Add `tagRequestBody` entries to `WebSocketRequestBody` union
  - [x] Add imports for `CliSessionScanInput` and `CliSessionReadMessagesInput`
- [x] Step 3 — Contracts: NativeApi Interface
  - [x] Add `cliSessions` section to `NativeApi` in `packages/contracts/src/ipc.ts`
- [x] Step 4 — Contracts: Import Command
  - [x] Define `ThreadImportCommand` schema in `packages/contracts/src/orchestration.ts`
  - [x] Define `ThreadImportedPayload` schema
  - [x] Add `"thread.imported"` to `OrchestrationEventType` literals
  - [x] Add `ThreadImportCommand` to `DispatchableClientOrchestrationCommand` union
  - [x] Add `ThreadImportCommand` to `ClientOrchestrationCommand` union
  - [x] Add `thread.imported` to `OrchestrationEvent` union
- [x] Step 5 — Server: CLI Session Scanner Module
  - [x] Create `apps/server/src/cliSessionScanner.ts`
  - [x] Implement `scanClaudeSessions(cwd?)` — index reading, JSONL scanning, title extraction
  - [x] Implement `scanCodexSessions(cwd?)` — index reading, recursive file finding
  - [x] Implement `readCliSessionMessages()` — streaming JSONL parser for both formats
  - [x] Implement file path security validation
  - [x] Implement public entry functions: `scanCliSessions()`, `readCliSessionMessages()`
- [x] Step 6 — Server: WS Handler Integration
  - [x] Add `import * as cliSessionScanner` to `apps/server/src/wsServer.ts`
  - [x] Add `cliSessionsScan` case to `routeRequest` switch
  - [x] Add `cliSessionsReadMessages` case to `routeRequest` switch
- [x] Step 7 — Server: Orchestration (Decider + Projector + Pipeline)
  - [x] Import/re-export `ThreadImportedPayload` in `apps/server/src/orchestration/Schemas.ts`
  - [x] Add `thread.import` case to decider in `apps/server/src/orchestration/decider.ts`
  - [x] Add `thread.imported` case to projector in `apps/server/src/orchestration/projector.ts`
  - [x] Add `thread.imported` cases to ProjectionPipeline (thread + messages)
- [x] Checkpoint: `bun typecheck` passes (all server + contracts changes compile)
- [x] Step 8 — Client: NativeApi Wiring
  - [x] Add `cliSessions` section to api object in `apps/web/src/wsNativeApi.ts`
- [x] Step 9 — Client: CLI Session View Route
  - [x] Create `apps/web/src/routes/_chat.cli-session.tsx`
  - [x] Define route with `source`, `filePath`, and `title` search params
- [x] Step 10 — Client: CliSessionView Component
  - [x] Create `apps/web/src/components/CliSessionView.tsx`
  - [x] Implement read-only message list with markdown rendering
  - [x] Implement top banner with source icon, title, "Fork to T3 Code" button
  - [x] Implement fork handler (dispatch thread.import, navigate to new thread)
  - [x] Use react-query for message fetching
- [x] Step 11 — Client: Sidebar Local Sessions Section
  - [x] Create `apps/web/src/components/CliSessionsSidebar.tsx`
  - [x] Implement collapsible "Local Sessions" header with chevron
  - [x] Implement Claude/Codex ToggleGroup tabs
  - [x] Implement refresh button (invalidates react-query cache)
  - [x] Implement "Not available" state for uninstalled CLIs
  - [x] Implement "No sessions" empty state
  - [x] Implement session list rows with source icons and timestamps
  - [x] Implement click handler (navigate to cli-session route)
  - [x] Implement right-click context menu with "Fork to T3 Code"
  - [x] Integrate into `Sidebar.tsx` — render per project after thread list
- [x] Step 12 — Final Verification
  - [x] `bun typecheck` — passes (1 pre-existing GuidesSidebar error unrelated to our work)
  - [x] `bun lint` — 0 warnings, 0 errors
  - [x] `bun fmt` — clean
  - [x] `bun run test` — all tests relevant to our changes pass (4 pre-existing failures in wsServer/codexAppServer unrelated to our work)

## Pending
- [ ] Manual testing against checklist in readme.md

## Blocked
(none)

## Notes
- All 12 implementation steps complete
- Pre-existing test failures (4) are about model selection defaults and collaboration preset text — not related to CLI sessions feature
- Must use Node.js 24+ for server tests (node:sqlite requirement)
