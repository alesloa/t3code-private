# AI Image Generation/Editing with Nanabanana Models — Implementation Plan

## Status: IN_PROGRESS
## Last Updated: 2026-03-27

## Goal

Add AI image generation/editing to the file editor panel using Google's Nanabanana models via the Gemini API. Users can view an image, click "Edit with AI", type a prompt, select a model, and generate new images without destroying the original.

## Context

The file editor panel already supports viewing images (loaded via `readFileBase64` API, rendered as `<img>` with checkerboard background in `FileEditorPanel.tsx`). The user wants to extend this with AI-powered image editing using Google's Nanabanana models. The Gemini API key must be stored server-side (in `settings.json`) so it syncs across all devices.

## Nanabanana Models — Complete Specifications

### Model 1: Nanabanana (v1)
- **API ID**: `gemini-2.5-flash-image`
- **Resolutions**: 512, 1K, 2K, 4K
- **Default Resolution**: 1K
- **Extra Aspect Ratios**: none
- **Supports Thinking**: no
- **Use case**: Fast, production-ready, high-volume generation

### Model 2: Nanabanana 2
- **API ID**: `gemini-3.1-flash-image-preview`
- **Resolutions**: 0.5K, 1K, 2K, 4K
- **Default Resolution**: 1K
- **Extra Aspect Ratios**: 1:4, 4:1, 1:8, 8:1
- **Supports Thinking**: no
- **Use case**: Latest, best cost-performance ratio

### Model 3: Nanabanana 2 Pro
- **API ID**: `gemini-3-pro-image-preview`
- **Resolutions**: 1K, 2K, 4K
- **Default Resolution**: 1K
- **Extra Aspect Ratios**: none (but up to 14 reference images)
- **Supports Thinking**: yes
- **Use case**: Highest quality, complex edits, advanced reasoning

### Shared Across All Models
- **Common Aspect Ratios**: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
- **Number of images**: 1–4
- **API Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Auth**: `x-goog-api-key` header
- **Image editing**: Send reference image as `inline_data` part + text prompt part
- **Response format**: `candidates[].content.parts[]` containing `inline_data` with `mime_type` and `data` (base64)
- **Request body**: `{ contents: [{ parts: [...] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }`
- **Max prompt tokens**: ~480
- **SynthID watermark**: All generated images include invisible AI-generated watermark

## Technical Approach

### Architecture Decisions

1. **Browser-direct API calls** — Gemini API calls go from browser → Google API via `fetch()`. No server proxy needed. CORS is supported for API key auth at `generativelanguage.googleapis.com`.
2. **API key in ServerSettings** — Stored in `settings.json` on the server, syncs across all devices. The existing `useSettings()` / `useUpdateSettings()` hooks auto-route to server via `SERVER_SETTINGS_KEYS` set in `useSettings.ts`.
3. **`writeFileBase64` endpoint** — New server endpoint to save generated images as binary files. Follows the existing `readFileBase64` pattern (contracts → ws → server handler → web transport).
4. **New file naming** — Generated images saved as `{name}_ai_1.png`, `{name}_ai_2.png`, etc. Scans existing files via `listEntries` to find next available number.

## Files to Create/Modify

### NEW FILES (2)

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `apps/web/src/lib/geminiImageApi.ts` | Model definitions, `generateImage()` API client, `parseGeminiResponse()`, `generateOutputFilename()` helper |
| CREATE | `apps/web/src/components/AiImageEditor.tsx` | Collapsible AI image editing UI component rendered below images in FileEditorPanel |

### MODIFIED FILES (8)

| Action | File | Changes |
|--------|------|---------|
| EDIT | `packages/contracts/src/settings.ts` | Add `geminiApiKey` field to `ServerSettings` struct + `ServerSettingsPatch` |
| EDIT | `packages/contracts/src/project.ts` | Add `ProjectWriteFileBase64Input` and `ProjectWriteFileBase64Result` schemas |
| EDIT | `packages/contracts/src/ws.ts` | Add `projectsWriteFileBase64` to `WS_METHODS` + `WebSocketRequestBody` union |
| EDIT | `packages/contracts/src/ipc.ts` | Add `writeFileBase64` to `NativeApi.projects` interface |
| EDIT | `apps/server/src/wsServer.ts` | Add `case WS_METHODS.projectsWriteFileBase64` handler (binary file write) |
| EDIT | `apps/web/src/wsNativeApi.ts` | Wire `writeFileBase64` transport call |
| EDIT | `apps/web/src/routes/_chat.settings.tsx` | Add "AI Image Generation" `SettingsSection` with API key input |
| EDIT | `apps/web/src/components/FileEditorPanel.tsx` | Import + render `AiImageEditor` below `<img>` in image view, add `parseDataUrl()` helper |

## Code Snippets

### Settings Schema Addition (`packages/contracts/src/settings.ts`)

```typescript
// In ServerSettings struct (line ~73):
geminiApiKey: Schema.String.pipe(Schema.withDecodingDefault(() => "")),

// In ServerSettingsPatch struct (line ~142):
geminiApiKey: Schema.optionalKey(Schema.String),
```

### writeFileBase64 Contract (`packages/contracts/src/project.ts`)

```typescript
export const ProjectWriteFileBase64Input = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  base64: Schema.String,
});
export type ProjectWriteFileBase64Input = typeof ProjectWriteFileBase64Input.Type;

export const ProjectWriteFileBase64Result = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileBase64Result = typeof ProjectWriteFileBase64Result.Type;
```

### Server Handler (`apps/server/src/wsServer.ts`)

```typescript
case WS_METHODS.projectsWriteFileBase64: {
  const body = stripRequestTag(request.body);
  const target = yield* resolveWorkspacePath({
    workspaceRoot: body.cwd, relativePath: body.relativePath, path,
  });
  yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
    Effect.mapError((cause) => new RouteRequestError({
      message: `Failed to create directory: ${String(cause)}`,
    })),
  );
  const bytes = Buffer.from(body.base64, "base64");
  yield* fileSystem.writeFile(target.absolutePath, bytes).pipe(
    Effect.mapError((cause) => new RouteRequestError({
      message: `Failed to write file: ${String(cause)}`,
    })),
  );
  return { relativePath: target.relativePath };
}
```

### Gemini API Client (`apps/web/src/lib/geminiImageApi.ts`)

```typescript
export const NANABANANA_MODELS = [
  {
    id: "gemini-2.5-flash-image",
    name: "Nanabanana",
    resolutions: ["512", "1K", "2K", "4K"],
    defaultResolution: "1K",
    extraAspectRatios: [] as string[],
    supportsThinking: false,
  },
  {
    id: "gemini-3.1-flash-image-preview",
    name: "Nanabanana 2",
    resolutions: ["0.5K", "1K", "2K", "4K"],
    defaultResolution: "1K",
    extraAspectRatios: ["1:4", "4:1", "1:8", "8:1"],
    supportsThinking: false,
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Nanabanana 2 Pro",
    resolutions: ["1K", "2K", "4K"],
    defaultResolution: "1K",
    extraAspectRatios: [] as string[],
    supportsThinking: true,
  },
] as const;

export const COMMON_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

export interface GeminiImageRequest {
  apiKey: string;
  modelId: string;
  prompt: string;
  referenceImage?: { base64: string; mimeType: string };
  aspectRatio?: string;
  numberOfImages?: number;
}

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
  text?: string;
}

export async function generateImage(request: GeminiImageRequest): Promise<GeminiImageResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.modelId}:generateContent`;

  const parts: Array<Record<string, unknown>> = [];
  if (request.referenceImage) {
    parts.push({
      inline_data: {
        mime_type: request.referenceImage.mimeType,
        data: request.referenceImage.base64,
      },
    });
  }
  parts.push({ text: request.prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": request.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return parseGeminiResponse(data);
}
```

### AiImageEditor Component Props

```typescript
interface AiImageEditorProps {
  cwd: string;
  relativePath: string;
  base64: string;
  mimeType: string;
}
```

### FileEditorPanel Integration

```typescript
// In FileContentView, replace the image rendering block:
if (imageDataUrl) {
  const { mimeType: imgMime, base64: imgBase64 } = parseDataUrl(imageDataUrl);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-1 items-center justify-center bg-[checkerboard] p-6">
        <img src={imageDataUrl} alt={baseName(tab.relativePath)} className="max-h-full max-w-full object-contain" />
      </div>
      <AiImageEditor cwd={tab.cwd} relativePath={tab.relativePath} base64={imgBase64} mimeType={imgMime} />
    </div>
  );
}

// Helper:
function parseDataUrl(url: string): { mimeType: string; base64: string } {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mimeType: "application/octet-stream", base64: "" };
  return { mimeType: match[1]!, base64: match[2]! };
}
```

## Integration Points

### Settings Flow
- `ServerSettings.geminiApiKey` in `packages/contracts/src/settings.ts`
- Read via `useSettings((s) => s.geminiApiKey)` in components
- Write via `updateSettings({ geminiApiKey: value })` — auto-routes to server via `useUpdateSettings()` hook
- Server persists to `settings.json` via `ServerSettingsService` in `apps/server/src/serverSettings.ts`
- Changes broadcast to all clients via `WS_CHANNELS.serverConfigUpdated` push

### File Write Flow (saving generated images)
- `AiImageEditor` calls `ensureNativeApi().projects.writeFileBase64({ cwd, relativePath, base64 })`
- Routed through `wsNativeApi.ts` → WebSocket → `wsServer.ts` handler
- Server decodes base64 → writes binary via `fileSystem.writeFile()`
- After save, optionally opens new file in editor tab via `fileEditorStore.openFile()`

### Gemini API Flow
- Browser calls `generateImage()` from `geminiImageApi.ts`
- Direct `fetch()` to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth via `x-goog-api-key` header with the stored API key
- Reference image sent as `inline_data` part (base64 from existing `readFileBase64` result)
- Response parsed to extract generated image base64 data

## Decisions Made

1. **ServerSettings for API key** (not ClientSettings) — user is the only user, needs key to sync across devices. Stored in `settings.json` on server.
2. **No server proxy for Gemini API** — browser-direct calls avoid adding Google SDK dependency to server. CORS is supported.
3. **Collapsible UI** — the AI editor is collapsed by default below the image, not always visible. Keeps the image viewer clean.
4. **New file naming convention** — `{original}_ai_{N}.{ext}` prevents accidental overwrites. Scans directory for next available N.
5. **No Google SDK dependency** — uses raw `fetch()` to keep the bundle lean.
