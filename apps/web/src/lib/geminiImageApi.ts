// ── Nanabanana Model Definitions ─────────────────────────────────────

export const NANABANANA_MODELS = [
  {
    id: "gemini-2.5-flash-image",
    name: "NB",
    fullName: "NanoBanana",
    maxReferenceImages: 5,
    hasResolutionPicker: false,
    resolutions: [] as string[],
    extraAspectRatios: [] as string[],
    thinkingLevels: [] as string[],
  },
  {
    id: "gemini-3.1-flash-image-preview",
    name: "NB2",
    fullName: "NanoBanana 2",
    maxReferenceImages: 14,
    hasResolutionPicker: true,
    resolutions: ["1K", "2K", "4K"],
    extraAspectRatios: ["4:1", "1:4", "8:1", "1:8"],
    thinkingLevels: ["MINIMAL", "HIGH"],
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "NB2 Pro",
    fullName: "NanoBanana 2 Pro",
    maxReferenceImages: 14,
    hasResolutionPicker: true,
    resolutions: ["1K", "2K", "4K"],
    extraAspectRatios: [] as string[],
    thinkingLevels: [] as string[],
  },
] as const;

export type NanabananaModel = (typeof NANABANANA_MODELS)[number];

export const COMMON_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
];

// ── API Types ────────────────────────────────────────────────────────

export interface GeminiImageRequest {
  apiKey: string;
  modelId: string;
  prompt: string;
  referenceImage?: { base64: string; mimeType: string } | undefined;
  aspectRatio?: string | undefined;
  imageSize?: string | undefined;
  thinkingLevel?: string | undefined;
  numberOfImages?: number | undefined;
}

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
  text?: string | undefined;
}

// ── API Call ─────────────────────────────────────────────────────────

export async function generateImage(request: GeminiImageRequest): Promise<GeminiImageResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.modelId}:generateContent`;

  // Build parts: reference image(s) first, then text prompt
  const parts: Array<Record<string, unknown>> = [];
  if (request.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: request.referenceImage.mimeType,
        data: request.referenceImage.base64,
      },
    });
  }
  parts.push({ text: request.prompt });

  // Build generationConfig matching the actual Gemini API structure
  const imageConfig: Record<string, string> = {};
  if (request.aspectRatio) {
    imageConfig.aspectRatio = request.aspectRatio;
  }
  if (request.imageSize) {
    imageConfig.imageSize = request.imageSize;
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    imageConfig,
  };

  if (request.thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel: request.thinkingLevel,
    };
  }

  const body = {
    contents: [
      {
        role: "User",
        parts,
      },
    ],
    generationConfig,
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

// ── Response Parsing ─────────────────────────────────────────────────

function parseGeminiResponse(data: Record<string, unknown>): GeminiImageResult[] {
  const results: GeminiImageResult[] = [];
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates) return results;

  for (const candidate of candidates) {
    const content = candidate.content as { parts?: Array<Record<string, unknown>> } | undefined;
    if (!content?.parts) continue;

    let text: string | undefined;
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;

    for (const part of content.parts) {
      if (part.text && typeof part.text === "string") {
        text = part.text;
      }
      // Handle both snake_case and camelCase response formats
      const inlineData = (part.inline_data ?? part.inlineData) as
        | { mime_type?: string; mimeType?: string; data?: string }
        | undefined;
      if (inlineData?.data) {
        imageBase64 = inlineData.data;
        imageMimeType = inlineData.mime_type ?? inlineData.mimeType;
      }
    }

    if (imageBase64 && imageMimeType) {
      results.push({ base64: imageBase64, mimeType: imageMimeType, text });
    }
  }

  return results;
}

// ── Output Filename Helper ───────────────────────────────────────────

export function generateOutputFilename(originalPath: string, existingPaths: string[]): string {
  const lastDot = originalPath.lastIndexOf(".");
  const name = lastDot > 0 ? originalPath.slice(0, lastDot) : originalPath;
  const ext = lastDot > 0 ? originalPath.slice(lastDot) : ".png";

  const existingSet = new Set(existingPaths);
  let n = 1;
  while (existingSet.has(`${name}_ai_${n}${ext}`)) {
    n++;
  }
  return `${name}_ai_${n}${ext}`;
}
