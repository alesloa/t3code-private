import { AlertTriangleIcon, ArrowLeftIcon, LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuideId, GuideMeta } from "@t3tools/contracts";

import { ensureNativeApi } from "../nativeApi";
import { useGuideStore } from "../guideStore";
import { toastManager } from "./ui/toast";

interface GuideViewerProps {
  guideId: string;
}

const SCOPE_LABELS: Record<string, string> = {
  project: "Project",
  directory: "Directory",
  file: "File",
  topic: "Topic",
};

const DEPTH_LABELS: Record<string, string> = {
  quick: "Quick Explain",
  full: "Full Course",
};

export default function GuideViewer({ guideId }: GuideViewerProps) {
  const [guide, setGuide] = useState<GuideMeta | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const activeGeneration = useGuideStore((s) => s.activeGenerations.get(guideId));
  const storedGuide = useGuideStore((s) => s.guides.get(guideId));

  const fetchGuide = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const result = await api.guides.read({ guideId: guideId as GuideId });
      setGuide(result.guide);
      setHtml(result.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [guideId]);

  useEffect(() => {
    void fetchGuide();
  }, [fetchGuide]);

  // Re-fetch when generation completes via store update
  useEffect(() => {
    if (!activeGeneration && storedGuide?.status === "completed" && guide?.status !== "completed") {
      void fetchGuide();
    }
  }, [activeGeneration, storedGuide, guide?.status, fetchGuide]);

  // Poll for completion when guide is generating (covers cases where push events are missed)
  const guideStatus = guide?.status;
  useEffect(() => {
    if (guideStatus !== "generating" && guideStatus !== "queued") return;
    const interval = setInterval(() => {
      void fetchGuide();
    }, 5000);
    return () => clearInterval(interval);
  }, [guideStatus, fetchGuide]);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    setHtml(null);
    try {
      const api = ensureNativeApi();
      const result = await api.guides.regenerate({ guideId: guideId as GuideId });
      setGuide(result.guide);
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to regenerate",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRegenerating(false);
    }
  }, [guideId]);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  const blobUrl = useMemo(() => {
    if (!html) return null;
    const blob = new Blob([html], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [html]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={handleBack}
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <LoaderIcon className="size-5 animate-spin text-muted-foreground/50" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={handleBack}
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">Error</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangleIcon className="size-8 text-destructive-foreground/60" />
          <p className="text-sm text-destructive-foreground">{error}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => void fetchGuide()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Generating state (guide exists but not completed, or regenerate in flight)
  if (guide && (guide.status !== "completed" || regenerating)) {
    const isGenerating = guide.status === "generating" || guide.status === "queued" || regenerating;
    const progressMessage =
      activeGeneration?.message ?? (isGenerating ? "Generating guide..." : "");
    const progressPercent = activeGeneration?.percent;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={handleBack}
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {guide.title}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {guide.status === "failed" && !regenerating ? (
            <>
              <AlertTriangleIcon className="size-8 text-destructive-foreground/60" />
              <p className="text-sm text-destructive-foreground">
                {guide.errorMessage ?? "Generation failed"}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
              >
                <RefreshCwIcon className={`size-3.5 ${regenerating ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </>
          ) : (
            <>
              <LoaderIcon className="size-6 animate-spin text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{progressMessage}</p>
              <p className="max-w-xs text-xs text-muted-foreground/50">
                {guide.scope === "project"
                  ? "Full project guides can take 5\u201315 minutes depending on codebase size."
                  : guide.scope === "topic"
                    ? "Topic guides typically take 3\u201310 minutes."
                    : guide.depth === "full"
                      ? "Full interactive guides take a few minutes to generate."
                      : "Quick guides usually finish in 1\u20133 minutes."}
              </p>
              {progressPercent != null && (
                <div className="w-48">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground/50">
                    {progressPercent}%
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Completed state with HTML
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={handleBack}
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {guide?.title ?? "Guide"}
        </span>
        {guide && (
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {DEPTH_LABELS[guide.depth] ?? guide.depth}
            </span>
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {SCOPE_LABELS[guide.scope] ?? guide.scope}
            </span>
          </div>
        )}
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
          title="Regenerate guide"
        >
          <RefreshCwIcon className={`size-4 ${regenerating ? "animate-spin" : ""}`} />
        </button>
      </div>
      {blobUrl ? (
        <iframe
          className="flex-1 border-0 w-full"
          src={blobUrl}
          sandbox="allow-scripts"
          title={guide?.title ?? "Guide"}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No content available</p>
        </div>
      )}
    </div>
  );
}
