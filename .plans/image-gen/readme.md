# AI Image Generation with Nanabanana — Important Context

## Critical Information

- The **file editor panel** with image viewing is ALREADY BUILT and working. Images load via `readFileBase64` API and render as `<img>` with checkerboard background in `FileEditorPanel.tsx`.
- The **`readFileBase64`** API is ALREADY BUILT (contracts, server handler, client transport). The image's base64 data and mimeType are already available in state when viewing an image.
- The **settings system** is split: `ServerSettings` (persisted in `settings.json` on server) and `ClientSettings` (localStorage). The Gemini API key goes in **ServerSettings** so it syncs across devices.
- The **`writeFile`** API only handles text (string). A new **`writeFileBase64`** endpoint is needed to save generated binary images.
- Gemini API calls go **directly from the browser** to Google's API — no server proxy. This is intentional to avoid adding Google SDK dependencies to the server.
- The three Nanabanana models have **different settings** (resolutions, aspect ratios, thinking support). The UI must filter available options per selected model.

## Caveats

- `resolveWorkspacePath` in `wsServer.ts` was renamed from `resolveWorkspaceWritePath` during prior work — both read and write handlers use it. Don't create a duplicate.
- The `ServerSettings` struct uses Effect Schema with `Schema.withDecodingDefault()` — new fields with defaults are automatically backward compatible (existing `settings.json` files without the field will get the default).
- The `splitPatch` function in `useSettings.ts` uses `SERVER_SETTINGS_KEYS` (derived from `Struct.keys(ServerSettings.fields)`) to auto-route patches. Adding `geminiApiKey` to `ServerSettings` automatically makes it a server-routed key — no hook changes needed.
- The `Button` component has no `xs` size variant. Use `sm` with custom className for smaller buttons.
- The `Collapsible` and `CollapsibleContent` components are already available in `~/components/ui/collapsible`.
- The `Select`, `SelectItem`, `SelectPopup`, `SelectTrigger`, `SelectValue` components are already used in the settings page.
- `bun test` is wrong — must use `bun run test` (runs Vitest).
- Pre-existing test failures (137) in `t3:test` are all `node:sqlite` version issues — NOT our changes.

## Dependencies

- **No new packages needed** — uses raw `fetch()` for Gemini API calls
- **Already installed**: `react`, `zustand`, `@tanstack/react-query`, `lucide-react`, `effect`
- **Already available**: `Collapsible`, `Select`, `Input`, `Button`, `Switch`, `Tooltip` UI components
- **Already available**: `toastManager` for notifications, `useSettings()` / `useUpdateSettings()` for settings

## Testing Notes

### Automated
```bash
bun fmt        # oxfmt formatter
bun lint       # oxlint linter
bun typecheck  # turbo run typecheck across all packages
bun run test   # vitest (NOT `bun test`)
```

### Manual Testing Scenarios
1. Settings → enter Gemini API key → persists → survives page refresh → available on other devices
2. Open image in file editor → "Edit with AI" button visible below image
3. Click "Edit with AI" → collapsible panel expands
4. Select each Nanabanana model → verify settings (aspect ratios, resolutions) update per model
5. Type prompt → click Generate → loading spinner → generated image preview appears
6. "Save as new file" → new file created next to original with `_ai_N` suffix
7. Original image unchanged after generation
8. No API key configured → shows message with link to Settings page
9. Invalid API key → shows error from Gemini API
10. Large image as reference → verify it uploads correctly (base64 in request)

## Known Limitations

- No mask-based inpainting UI (would need a canvas drawing tool — future work)
- No image-to-image style transfer (just prompt-based editing)
- Max prompt length ~480 tokens (Gemini API limit)
- Generated images include invisible SynthID watermark (Google requirement, non-removable)
- No progress streaming for generation — request is fire-and-wait
- Gemini API may rate-limit at high volume (no retry logic in initial implementation)

## Related Files

### Already Modified (prior conversation turns — file editor + image viewer)
- `packages/contracts/src/project.ts` — `ProjectReadFileBase64Result` schema
- `packages/contracts/src/ws.ts` — `projectsReadFileBase64` WS method
- `packages/contracts/src/ipc.ts` — `readFileBase64` in `NativeApi.projects`
- `apps/server/src/wsServer.ts` — `projectsReadFileBase64` handler, `resolveImageMimeType()` helper
- `apps/web/src/wsNativeApi.ts` — `readFileBase64` transport call
- `apps/web/src/lib/fileEditorUtils.ts` — `isImageFile()`, `isBinaryExtension()`, `BINARY_EXTENSIONS`
- `apps/web/src/components/FileEditorPanel.tsx` — Image viewing with checkerboard, `imageDataUrl` state
- `apps/web/src/fileEditorStore.ts` — Zustand store for editor tabs

### Key Reference Files (for patterns)
- `apps/web/src/routes/_chat.settings.tsx` — Settings page (`SettingsSection`, `SettingsRow` components)
- `packages/contracts/src/settings.ts` — Settings types (`ServerSettings`, `ServerSettingsPatch`, `ClientSettingsSchema`)
- `apps/web/src/hooks/useSettings.ts` — `useSettings()`, `useUpdateSettings()` hooks
- `apps/server/src/serverSettings.ts` — `ServerSettingsService` (file watching, atomic writes, deep merge)
- `apps/web/src/components/ui/collapsible.tsx` — Collapsible component
- `apps/web/src/components/ui/select.tsx` — Select component
- `apps/web/src/components/ui/toast.ts` — `toastManager` for notifications

## Recovery Instructions

If resuming after compaction:
1. Read this file first for critical context
2. Read `task.md` for current progress — find the `RESUME HERE` marker
3. Read `plans.md` for full technical details and code snippets
4. Check `git status` for any uncommitted work
5. The plan file at `/Users/alesloas/.claude/plans/gentle-booping-raven.md` has the approved plan
6. All image viewing infrastructure is DONE — focus is on adding generation/editing UI
7. The `writeFileBase64` endpoint + settings changes are the foundation — do those first
