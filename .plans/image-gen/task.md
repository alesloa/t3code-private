# AI Image Generation with Nanabanana — Tasks

## Current Status: Phase 1 — Foundation (not started)

## Phase 1 — Foundation (contracts + server + transport)

- [ ] **Add `geminiApiKey` to `ServerSettings`** in `packages/contracts/src/settings.ts`
  - Add `geminiApiKey: Schema.String.pipe(Schema.withDecodingDefault(() => ""))` to `ServerSettings` struct
  - Add `geminiApiKey: Schema.optionalKey(Schema.String)` to `ServerSettingsPatch`
- [ ] **Add `writeFileBase64` contract** in `packages/contracts/src/project.ts`
  - `ProjectWriteFileBase64Input`: `{ cwd, relativePath, base64 }`
  - `ProjectWriteFileBase64Result`: `{ relativePath }`
- [ ] **Register WS method** in `packages/contracts/src/ws.ts`
  - Add `projectsWriteFileBase64: "projects.writeFileBase64"` to `WS_METHODS`
  - Add `tagRequestBody(WS_METHODS.projectsWriteFileBase64, ProjectWriteFileBase64Input)` to union
- [ ] **Add to NativeApi interface** in `packages/contracts/src/ipc.ts`
  - Add `writeFileBase64` to `projects` section
- [ ] **Implement server handler** in `apps/server/src/wsServer.ts`
  - Add `case WS_METHODS.projectsWriteFileBase64` after `projectsWriteFile`
  - Decode base64 → `Buffer.from(body.base64, "base64")`
  - Write binary via `fileSystem.writeFile()`
- [ ] **Wire client transport** in `apps/web/src/wsNativeApi.ts`
  - Add `writeFileBase64: (input) => transport.request(WS_METHODS.projectsWriteFileBase64, input)`

## Phase 2 — Settings Page

- [ ] **Add "AI Image Generation" section** to `apps/web/src/routes/_chat.settings.tsx`
  - New `SettingsSection` before "Advanced" section (~line 1268)
  - `SettingsRow` with title "Gemini API key"
  - Password input with show/hide toggle (eye icon)
  - Value from `useSettings((s) => s.geminiApiKey)`
  - Write via `updateSettings({ geminiApiKey: value })`
  - Reset button when non-empty

## Phase 3 — Gemini API Client

- [ ] **Create `apps/web/src/lib/geminiImageApi.ts`**
  - `NANABANANA_MODELS` constant array (3 models with all their specs)
  - `COMMON_ASPECT_RATIOS` constant array
  - `GeminiImageRequest` and `GeminiImageResult` interfaces
  - `generateImage()` — `fetch()` call to Google's API
    - Builds request body with `responseModalities: ["IMAGE", "TEXT"]`
    - Sends reference image as `inline_data` part
    - Auth via `x-goog-api-key` header
  - `parseGeminiResponse()` — extracts base64 images from response candidates
  - `generateOutputFilename()` — generates `{name}_ai_{N}.{ext}` filenames

## Phase 4 — AI Image Editor Component

- [ ] **Create `apps/web/src/components/AiImageEditor.tsx`**
  - Props: `{ cwd, relativePath, base64, mimeType }`
  - State: `isExpanded`, `prompt`, `selectedModelId`, `aspectRatio`, `numberOfImages`, `isGenerating`, `generatedImages`, `error`
  - Collapsible panel with "Edit with AI" toggle button
  - Model selector (Select component with 3 Nanabanana models)
  - Aspect ratio selector (filtered per model — includes `extraAspectRatios`)
  - Number of images selector (1–4)
  - Prompt textarea
  - Generate button with loading state
  - Generated image previews grid
  - "Save as new file" button per preview → `writeFileBase64` → toast → open in editor tab
  - No API key → message with link to Settings
  - Error display with retry

## Phase 5 — Integration into FileEditorPanel

- [ ] **Modify `apps/web/src/components/FileEditorPanel.tsx`**
  - Import `AiImageEditor`
  - Add `parseDataUrl()` helper function
  - Modify image rendering block to wrap `<img>` + `<AiImageEditor>` in a flex column
  - Pass `cwd`, `relativePath`, `base64`, `mimeType` to `AiImageEditor`

## Verification

- [ ] `bun fmt` passes
- [ ] `bun lint` passes
- [ ] `bun typecheck` passes
- [ ] `bun run test` — no new failures (pre-existing sqlite failures are OK)
- [ ] Manual test: Settings → enter API key → persists across refresh
- [ ] Manual test: Open image → "Edit with AI" button visible
- [ ] Manual test: Select model → settings filter correctly per model
- [ ] Manual test: Type prompt → Generate → image preview appears
- [ ] Manual test: Save generated image → new file created → original unchanged
- [ ] Manual test: No API key → shows "Configure API key" message

## Notes

- All image viewing infrastructure (readFileBase64, image display, etc.) is DONE — no changes needed there
- The `writeFileBase64` endpoint follows the exact same pattern as `readFileBase64` — just in reverse
- The Gemini API key auto-routes to server storage because `geminiApiKey` will be in `SERVER_SETTINGS_KEYS` (derived from `ServerSettings.fields`)
- No new npm packages needed — uses raw `fetch()` for Gemini API
- Pre-existing test failures (137) in `t3:test` are all `node:sqlite` version issues — NOT our changes
