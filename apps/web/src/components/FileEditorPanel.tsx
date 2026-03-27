import { ThreadId } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { EyeIcon, FileWarningIcon, LoaderIcon, PencilIcon, SaveIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { GENERATE_IMAGE_PREFIX, useFileEditorStore, type FileEditorTab } from "~/fileEditorStore";
import { useTheme } from "~/hooks/useTheme";
import {
  isBinaryContent,
  isBinaryExtension,
  isImageFile,
  isMarkdownFile,
  LARGE_FILE_MAX_BYTES,
} from "~/lib/fileEditorUtils";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { type FileEditorPanelMode, FileEditorPanelShell } from "./FileEditorPanelShell";
import { MarkdownPreview } from "./MarkdownPreview";
import { Button } from "./ui/button";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { AiImageEditor } from "./AiImageEditor";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";

// ── Tab strip ─────────────────────────────────────────────────────────

const EditorTab = memo(function EditorTab(props: {
  tab: FileEditorTab;
  index: number;
  isActive: boolean;
  isDirty: boolean;
  resolvedTheme: "light" | "dark";
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
}) {
  const { tab, index, isActive, isDirty, resolvedTheme, onSelect, onClose } = props;
  const isGenTab = tab.relativePath.startsWith(GENERATE_IMAGE_PREFIX);
  const fileName = isGenTab ? "Generate Image" : baseName(tab.relativePath);
  const displayPath = isGenTab
    ? tab.relativePath.slice(GENERATE_IMAGE_PREFIX.length)
    : tab.relativePath;

  return (
    <button
      type="button"
      className={cn(
        "group flex h-8 max-w-[180px] shrink-0 items-center gap-1.5 border-b-2 px-2 text-[11px] transition-colors",
        isActive
          ? "border-foreground/80 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground/80",
      )}
      onClick={() => onSelect(index)}
      title={displayPath}
    >
      <VscodeEntryIcon
        pathValue={isGenTab ? "image.png" : tab.relativePath}
        kind="file"
        theme={resolvedTheme}
        className="size-3.5 shrink-0"
      />
      <span className="min-w-0 truncate font-mono">{fileName}</span>
      {isDirty && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
      <span
        role="button"
        tabIndex={0}
        className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onClose(index);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onClose(index);
          }
        }}
      >
        <XIcon className="size-3" />
      </span>
    </button>
  );
});

// ── File content view ─────────────────────────────────────────────────

const FileContentView = memo(function FileContentView(props: {
  tab: FileEditorTab;
  theme: "light" | "dark";
  threadId: string | null;
}) {
  const { tab, theme, threadId } = props;

  // Virtual "Generate Image" tab — no file to load, just show the AI editor
  if (tab.relativePath.startsWith(GENERATE_IMAGE_PREFIX)) {
    const folderPath = tab.relativePath.slice(GENERATE_IMAGE_PREFIX.length);
    return threadId ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <AiImageEditor cwd={tab.cwd} relativePath={folderPath} threadId={threadId} />
      </div>
    ) : null;
  }

  const [contents, setContents] = useState<string | null>(null);
  const [savedContents, setSavedContents] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const dirtyTabsRef = useRef<Set<string>>(new Set());

  const isDirty = contents !== null && savedContents !== null && contents !== savedContents;
  const isMd = isMarkdownFile(tab.relativePath);
  const isImage = isImageFile(tab.relativePath);
  const isBinaryExt = isBinaryExtension(tab.relativePath);

  // Track dirty state for the tab indicator
  const tabKey = `${tab.cwd}:${tab.relativePath}`;
  useEffect(() => {
    if (isDirty) {
      dirtyTabsRef.current.add(tabKey);
    } else {
      dirtyTabsRef.current.delete(tabKey);
    }
  }, [isDirty, tabKey]);

  // Load file contents
  useEffect(() => {
    // Images: load as base64
    if (isImage) {
      let cancelled = false;
      setLoading(true);
      setError(null);
      setContents(null);
      setImageDataUrl(null);

      const api = ensureNativeApi();
      void api.projects
        .readFileBase64({ cwd: tab.cwd, relativePath: tab.relativePath })
        .then((result) => {
          if (cancelled) return;
          setImageDataUrl(`data:${result.mimeType};base64,${result.base64}`);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to read image");
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    // Non-image binary files: show error
    if (isBinaryExt) {
      setLoading(false);
      setError("Binary file — cannot display in editor.");
      return;
    }

    // Text files: read as string
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContents(null);
    setSavedContents(null);
    setImageDataUrl(null);
    setShowPreview(false);

    const api = ensureNativeApi();
    void api.projects
      .readFile({ cwd: tab.cwd, relativePath: tab.relativePath })
      .then((result) => {
        if (cancelled) return;

        if (result.contents.length > LARGE_FILE_MAX_BYTES) {
          setError(
            `File is too large to edit (${formatBytes(result.contents.length)}). Maximum is 5 MB.`,
          );
          setLoading(false);
          return;
        }

        if (isBinaryContent(result.contents)) {
          setError("Binary file — cannot display in editor.");
          setLoading(false);
          return;
        }

        setContents(result.contents);
        setSavedContents(result.contents);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to read file");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab.cwd, tab.relativePath, isBinaryExt, isImage]);

  const handleSave = useCallback(async () => {
    if (contents === null || !isDirty) return;
    setSaving(true);
    try {
      const api = ensureNativeApi();
      await api.projects.writeFile({
        cwd: tab.cwd,
        relativePath: tab.relativePath,
        contents,
      });
      setSavedContents(contents);
      toastManager.add({ type: "success", title: "File saved" });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to save",
        description: err instanceof Error ? err.message : "An error occurred.",
      });
    } finally {
      setSaving(false);
    }
  }, [tab.cwd, tab.relativePath, contents, isDirty]);

  const handleChange = useCallback((value: string) => {
    setContents(value);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground/60">
        <LoaderIcon className="size-4 animate-spin" />
        <span className="text-xs">Loading file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <FileWarningIcon className="size-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground/70">{error}</p>
      </div>
    );
  }

  // Image preview + AI editor
  if (imageDataUrl) {
    const { mimeType: imgMime, base64: imgBase64 } = parseDataUrl(imageDataUrl);
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex flex-1 items-center justify-center bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-6">
          <img
            src={imageDataUrl}
            alt={baseName(tab.relativePath)}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        {threadId ? (
          <AiImageEditor
            cwd={tab.cwd}
            relativePath={tab.relativePath}
            base64={imgBase64}
            mimeType={imgMime}
            threadId={threadId}
          />
        ) : null}
      </div>
    );
  }

  if (contents === null) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        {isMd && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={showPreview ? "secondary" : "ghost"}
                  onClick={() => setShowPreview((p) => !p)}
                  className="h-6 gap-1 px-2 text-[11px]"
                >
                  {showPreview ? <PencilIcon className="size-3" /> : <EyeIcon className="size-3" />}
                  {showPreview ? "Edit" : "Preview"}
                </Button>
              }
            />
            <TooltipPopup side="bottom">
              {showPreview ? "Switch to editor" : "Preview markdown"}
            </TooltipPopup>
          </Tooltip>
        )}
        <div className="flex-1" />
        {isDirty && <span className="text-[10px] text-amber-500/80">unsaved</span>}
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || saving}
          onClick={() => void handleSave()}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          {saving ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <SaveIcon className="size-3" />
          )}
          Save
        </Button>
      </div>

      {/* Editor / Preview */}
      <div className="min-h-0 flex-1">
        {showPreview && isMd ? (
          <MarkdownPreview contents={contents} />
        ) : (
          <CodeMirrorEditor
            contents={contents}
            filePath={tab.relativePath}
            theme={theme}
            onChange={handleChange}
            onSave={() => void handleSave()}
          />
        )}
      </div>
    </div>
  );
});

// ── Main Panel ────────────────────────────────────────────────────────

function FileEditorPanel(props: { mode: FileEditorPanelMode }) {
  const { mode } = props;
  const { resolvedTheme } = useTheme();
  const activeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const editorState = useFileEditorStore((s) =>
    activeThreadId ? s.stateByThreadId[activeThreadId] : undefined,
  );
  const closePanel = useFileEditorStore((s) => s.closePanel);
  const setActiveTab = useFileEditorStore((s) => s.setActiveTab);
  const closeTab = useFileEditorStore((s) => s.closeTab);

  const tabs = editorState?.tabs ?? [];
  const activeTabIndex = editorState?.activeTabIndex ?? 0;
  const activeTab = tabs[activeTabIndex];

  const handleSelectTab = useCallback(
    (index: number) => {
      if (!activeThreadId) return;
      setActiveTab(activeThreadId, index);
    },
    [activeThreadId, setActiveTab],
  );

  const handleCloseTab = useCallback(
    (index: number) => {
      if (!activeThreadId) return;
      closeTab(activeThreadId, index);
    },
    [activeThreadId, closeTab],
  );

  const handleClosePanel = useCallback(() => {
    if (!activeThreadId) return;
    closePanel(activeThreadId);
  }, [activeThreadId, closePanel]);

  const header = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab, index) => (
          <EditorTab
            key={`${tab.cwd}:${tab.relativePath}`}
            tab={tab}
            index={index}
            isActive={index === activeTabIndex}
            isDirty={false}
            resolvedTheme={resolvedTheme}
            onSelect={handleSelectTab}
            onClose={handleCloseTab}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClosePanel}
          className="size-7 p-0"
          aria-label="Close editor panel"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </>
  );

  return (
    <FileEditorPanelShell mode={mode} header={header}>
      {activeTab ? (
        <FileContentView
          key={`${activeTab.cwd}:${activeTab.relativePath}`}
          tab={activeTab}
          theme={resolvedTheme}
          threadId={activeThreadId}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/60">
          No file open
        </div>
      )}
    </FileEditorPanelShell>
  );
}

export default FileEditorPanel;

// ── Helpers ───────────────────────────────────────────────────────────

function baseName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDataUrl(url: string): { mimeType: string; base64: string } {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mimeType: "application/octet-stream", base64: "" };
  return { mimeType: match[1]!, base64: match[2]! };
}
