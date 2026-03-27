import { useCallback, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  LoaderIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import { useSettings } from "~/hooks/useSettings";
import { ensureNativeApi } from "~/nativeApi";
import { useFileEditorStore } from "~/fileEditorStore";
import { toastManager } from "./ui/toast";
import { Button } from "./ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import {
  COMMON_ASPECT_RATIOS,
  generateImage,
  generateOutputFilename,
  type GeminiImageResult,
  NANABANANA_MODELS,
} from "~/lib/geminiImageApi";

interface AiImageEditorProps {
  cwd: string;
  relativePath: string;
  base64?: string | undefined;
  mimeType?: string | undefined;
  threadId: string;
}

export function AiImageEditor({
  cwd,
  relativePath,
  base64,
  mimeType,
  threadId,
}: AiImageEditorProps) {
  const isGenerateOnly = !base64;
  const geminiApiKey = useSettings().geminiApiKey;
  const [isExpanded, setIsExpanded] = useState(isGenerateOnly);
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>(NANABANANA_MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [thinkingLevel, setThinkingLevel] = useState("MINIMAL");
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeminiImageResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => NANABANANA_MODELS.find((m) => m.id === selectedModelId) ?? NANABANANA_MODELS[0],
    [selectedModelId],
  );

  const availableAspectRatios = useMemo(
    () => [...COMMON_ASPECT_RATIOS, ...selectedModel.extraAspectRatios],
    [selectedModel],
  );

  const handleGenerate = useCallback(async () => {
    if (!geminiApiKey || !prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const results = await generateImage({
        apiKey: geminiApiKey,
        modelId: selectedModelId,
        prompt: prompt.trim(),
        referenceImage: base64 && mimeType ? { base64, mimeType } : undefined,
        aspectRatio,
        imageSize: selectedModel.hasResolutionPicker ? imageSize : undefined,
        thinkingLevel: selectedModel.thinkingLevels.length > 0 ? thinkingLevel : undefined,
        numberOfImages,
      });

      if (results.length === 0) {
        setError("No images were generated. Try a different prompt.");
      } else {
        setGeneratedImages(results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [
    geminiApiKey,
    prompt,
    selectedModelId,
    base64,
    mimeType,
    aspectRatio,
    imageSize,
    thinkingLevel,
    numberOfImages,
    selectedModel,
  ]);

  const handleSave = useCallback(
    async (result: GeminiImageResult) => {
      try {
        const api = ensureNativeApi();

        // For generate-only mode, relativePath is a folder — build a base filename
        const basePath = isGenerateOnly ? `${relativePath}/generated.png` : relativePath;
        const parentPath = basePath.includes("/")
          ? basePath.slice(0, basePath.lastIndexOf("/"))
          : undefined;
        const listing = await api.projects.listEntries({ cwd, parentPath });
        const existingPaths = listing.entries.map((e) => e.path);

        const newPath = generateOutputFilename(basePath, existingPaths);

        await api.projects.writeFileBase64({
          cwd,
          relativePath: newPath,
          base64: result.base64,
        });

        toastManager.add({ type: "success", title: `Saved ${newPath}` });

        useFileEditorStore.getState().openFile(threadId as any, cwd, newPath);
      } catch (err) {
        toastManager.add({
          type: "error",
          title: "Failed to save image",
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [cwd, relativePath, threadId, isGenerateOnly],
  );

  if (!isExpanded && !isGenerateOnly) {
    return (
      <div className="flex items-center justify-center border-t border-border p-2">
        <Button size="sm" variant="outline" onClick={() => setIsExpanded(true)}>
          <SparklesIcon className="size-3.5" />
          Edit with AI
        </Button>
      </div>
    );
  }

  const title = isGenerateOnly ? "Generate Image" : "Edit with AI";

  if (!geminiApiKey) {
    return (
      <div className={isGenerateOnly ? "p-4" : "border-t border-border p-4"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SparklesIcon className="size-4" />
            {title}
          </div>
          {!isGenerateOnly && (
            <Button size="icon-xs" variant="ghost" onClick={() => setIsExpanded(false)}>
              <ChevronDownIcon className="size-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/50 p-4 text-center">
          <SettingsIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Configure your Gemini API key in{" "}
            <a href="/settings" className="text-foreground underline underline-offset-2">
              Settings
            </a>{" "}
            to use AI image generation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={isGenerateOnly ? "p-4" : "border-t border-border p-4"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SparklesIcon className="size-4" />
          {title}
        </div>
        {!isGenerateOnly && (
          <Button size="icon-xs" variant="ghost" onClick={() => setIsExpanded(false)}>
            <ChevronUpIcon className="size-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {/* Row 1: Model + Aspect Ratio */}
        <div className="flex flex-wrap items-end gap-3">
          <FieldLabel label="Model">
            <Select value={selectedModelId} onValueChange={(v) => v && setSelectedModelId(v)}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {NANABANANA_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </FieldLabel>

          <FieldLabel label="Aspect Ratio">
            <Select value={aspectRatio} onValueChange={(v) => v && setAspectRatio(v)}>
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {availableAspectRatios.map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {ratio}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </FieldLabel>

          <FieldLabel label="Images">
            <Select
              value={String(numberOfImages)}
              onValueChange={(v) => v && setNumberOfImages(Number(v))}
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </FieldLabel>
        </div>

        {/* Row 2: Per-model options (Resolution, Thinking) */}
        {(selectedModel.hasResolutionPicker || selectedModel.thinkingLevels.length > 0) && (
          <div className="flex flex-wrap items-end gap-3">
            {selectedModel.hasResolutionPicker && (
              <FieldLabel label="Resolution">
                <Select value={imageSize} onValueChange={(v) => v && setImageSize(v)}>
                  <SelectTrigger size="sm" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {selectedModel.resolutions.map((res) => (
                      <SelectItem key={res} value={res}>
                        {res}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </FieldLabel>
            )}

            {selectedModel.thinkingLevels.length > 0 && (
              <FieldLabel label="Thinking">
                <Select value={thinkingLevel} onValueChange={(v) => v && setThinkingLevel(v)}>
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {selectedModel.thinkingLevels.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level.charAt(0) + level.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </FieldLabel>
            )}
          </div>
        )}

        {/* Prompt */}
        <textarea
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3}
          placeholder={
            isGenerateOnly
              ? "Describe the image you want to create..."
              : "Describe the edit you want to make..."
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        {/* Generate button */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedModel.fullName}
            {selectedModel.hasResolutionPicker ? ` \u00b7 ${imageSize}` : ""}
            {` \u00b7 ${aspectRatio}`}
            {selectedModel.thinkingLevels.length > 0
              ? ` \u00b7 ${thinkingLevel.charAt(0) + thinkingLevel.slice(1).toLowerCase()}`
              : ""}
          </span>
          <Button size="sm" disabled={isGenerating || !prompt.trim()} onClick={handleGenerate}>
            {isGenerating ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </div>

        {/* Error */}
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* Generated images grid */}
        {generatedImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {generatedImages.map((result, i) => (
              <div
                key={result.base64.slice(0, 32)}
                className="group relative overflow-hidden rounded-lg border border-border"
              >
                <img
                  src={`data:${result.mimeType};base64,${result.base64}`}
                  alt={`Generated ${i + 1}`}
                  className="w-full object-contain"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="xs" variant="secondary" onClick={() => handleSave(result)}>
                    <DownloadIcon className="size-3" />
                    Save as new file
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Small label wrapper for form fields ──────────────────────────────

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
