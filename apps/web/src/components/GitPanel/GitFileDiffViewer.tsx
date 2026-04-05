import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";
import type { ThreadId } from "@t3tools/contracts";
import { ArrowLeftIcon, Columns2Icon, LoaderIcon, Rows3Icon, TextWrapIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { type GitDiffFile, useGitPanelStore } from "~/gitPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { buildPatchCacheKey, resolveDiffThemeName } from "~/lib/diffRendering";
import { gitFileDiffQueryOptions } from "~/lib/gitReactQuery";

type DiffRenderMode = "stacked" | "split";

const UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-bottom: 1px solid var(--border) !important;
}
`;

function parseDiffToFiles(patch: string): FileDiffMetadata[] | null {
  const trimmed = patch.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePatchFiles(trimmed, buildPatchCacheKey(trimmed, "git-file-diff"));
    const files = parsed.flatMap((p) => p.files);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

export default function GitFileDiffViewer({
  gitCwd,
  threadId,
  diffFile,
}: {
  gitCwd: string;
  threadId: ThreadId;
  diffFile: GitDiffFile;
}) {
  const setActiveDiffFile = useGitPanelStore((s) => s.setActiveDiffFile);
  const [renderMode, setRenderMode] = useState<DiffRenderMode>("split");
  const [wordWrap, setWordWrap] = useState(false);
  const { resolvedTheme } = useTheme();

  const { data, isLoading } = useQuery(
    gitFileDiffQueryOptions(gitCwd, diffFile.path, diffFile.staged),
  );

  const parsedFiles = useMemo(() => {
    if (!data?.diff) return null;
    return parseDiffToFiles(data.diff);
  }, [data?.diff]);

  const goBack = () => setActiveDiffFile(threadId, null);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Button variant="ghost" size="icon-xs" onClick={goBack} aria-label="Back to changes">
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{diffFile.path}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {diffFile.staged ? "Staged" : "Unstaged"}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-3 py-1">
        <ToggleGroup
          variant="outline"
          size="xs"
          value={[renderMode]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "stacked" || next === "split") setRenderMode(next);
          }}
        >
          <Toggle aria-label="Stacked diff view" value="stacked">
            <Rows3Icon className="size-3" />
          </Toggle>
          <Toggle aria-label="Split diff view" value="split">
            <Columns2Icon className="size-3" />
          </Toggle>
        </ToggleGroup>
        <Toggle
          aria-label={wordWrap ? "Disable line wrapping" : "Enable line wrapping"}
          variant="outline"
          size="xs"
          pressed={wordWrap}
          onPressedChange={(pressed) => setWordWrap(Boolean(pressed))}
        >
          <TextWrapIcon className="size-3" />
        </Toggle>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !data?.diff && (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
            No changes to display.
          </div>
        )}

        {!isLoading && parsedFiles && (
          <div className="p-2">
            {parsedFiles.map((fileDiff) => (
              <div key={fileDiff.name ?? diffFile.path} className="diff-render-file rounded-md">
                <FileDiff
                  fileDiff={fileDiff}
                  options={{
                    diffStyle: renderMode === "split" ? "split" : "unified",
                    lineDiffType: "none",
                    overflow: wordWrap ? "wrap" : "scroll",
                    theme: resolveDiffThemeName(resolvedTheme as "light" | "dark"),
                    themeType: resolvedTheme as "light" | "dark",
                    unsafeCSS: UNSAFE_CSS,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {!isLoading && data?.diff && !parsedFiles && (
          <pre className="overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {data.diff}
          </pre>
        )}
      </div>
    </div>
  );
}
