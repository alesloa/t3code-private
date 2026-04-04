import { type ThreadId } from "@t3tools/contracts";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GitBranchIcon,
  GitCommitVerticalIcon,
  GitGraphIcon,
  GitPullRequestIcon,
  GripHorizontalIcon,
  PackageIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { type GitPanelTab, useGitPanelStore } from "~/gitPanelStore";
import { useStore } from "~/store";

import { type GitPanelMode, GitPanelShell } from "./GitPanelShell";
import ChangesSection from "./GitPanel/ChangesSection";

const ActivityLog = lazy(() => import("./GitPanel/ActivityLog"));
const BranchesTab = lazy(() => import("./GitPanel/BranchesTab"));
const GraphTab = lazy(() => import("./GitPanel/GraphTab"));
const StashTab = lazy(() => import("./GitPanel/StashTab"));
const WorktreesTab = lazy(() => import("./GitPanel/WorktreesTab"));
const PullRequestsTab = lazy(() => import("./GitPanel/PullRequestsTab"));

const TAB_ITEMS: { id: GitPanelTab; label: string; icon: ReactNode }[] = [
  { id: "graph", label: "Graph", icon: <GitGraphIcon className="size-3.5" /> },
  { id: "branches", label: "Branches", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "worktrees", label: "Worktrees", icon: <GitCommitVerticalIcon className="size-3.5" /> },
  { id: "stash", label: "Stash", icon: <PackageIcon className="size-3.5" /> },
  { id: "prs", label: "PRs", icon: <GitPullRequestIcon className="size-3.5" /> },
];

const MIN_CHANGES_HEIGHT = 80;

function useGitCwd(threadId: ThreadId): string | null {
  return useStore((store) => {
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) return null;
    if (thread.worktreePath) return thread.worktreePath;
    const project = store.projects.find((p) => p.id === thread.projectId);
    return project?.cwd ?? null;
  });
}

const GitPanel = memo(function GitPanel({
  mode,
  threadId,
}: {
  mode: GitPanelMode;
  threadId: ThreadId;
}) {
  const gitCwd = useGitCwd(threadId);
  const threadState = useGitPanelStore(
    (s) => s.stateByThreadId[threadId] ?? { activeTab: "graph", activityLogExpanded: false },
  );
  const setActiveTab = useGitPanelStore((s) => s.setActiveTab);
  const closePanel = useGitPanelStore((s) => s.closePanel);
  const toggleActivityLog = useGitPanelStore((s) => s.toggleActivityLog);

  const activeTab = threadState.activeTab;
  const activityLogExpanded = threadState.activityLogExpanded;

  // ── Resizable changes section ──────────────────────────────────────
  const [changesHeight, setChangesHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Initialize at 50% of container height on mount
  useEffect(() => {
    if (changesHeight !== null) return;
    const el = containerRef.current;
    if (!el) return;
    setChangesHeight(
      Math.max(MIN_CHANGES_HEIGHT, Math.floor(el.getBoundingClientRect().height * 0.5)),
    );
  }, [changesHeight]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (changesHeight === null) return;
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = changesHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [changesHeight],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const containerEl = containerRef.current;
      if (!containerEl) return;
      const containerHeight = containerEl.getBoundingClientRect().height;
      const maxHeight = containerHeight * 0.8;
      const delta = e.clientY - startY.current;
      const next = Math.max(MIN_CHANGES_HEIGHT, Math.min(maxHeight, startHeight.current + delta));
      setChangesHeight(next);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Keyboard shortcuts: 1-5 to switch tabs
  useEffect(() => {
    const tabKeys: GitPanelTab[] = ["graph", "branches", "worktrees", "stash", "prs"];
    const handler = (e: KeyboardEvent) => {
      const key = Number.parseInt(e.key, 10);
      if (key >= 1 && key <= 5 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
          return;
        setActiveTab(threadId, tabKeys[key - 1]!);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [threadId, setActiveTab]);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "graph":
        return (
          <Suspense fallback={null}>
            <GraphTab gitCwd={gitCwd} threadId={threadId} />
          </Suspense>
        );
      case "branches":
        return (
          <Suspense fallback={null}>
            <BranchesTab gitCwd={gitCwd} threadId={threadId} />
          </Suspense>
        );
      case "worktrees":
        return (
          <Suspense fallback={null}>
            <WorktreesTab gitCwd={gitCwd} threadId={threadId} />
          </Suspense>
        );
      case "stash":
        return (
          <Suspense fallback={null}>
            <StashTab gitCwd={gitCwd} threadId={threadId} />
          </Suspense>
        );
      case "prs":
        return (
          <Suspense fallback={null}>
            <PullRequestsTab gitCwd={gitCwd} threadId={threadId} />
          </Suspense>
        );
    }
  }, [activeTab, gitCwd, threadId]);

  const header = (
    <>
      <span className="no-drag text-xs font-medium">Git</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => closePanel(threadId)}
        aria-label="Close git panel"
        className="no-drag shrink-0"
      >
        <XIcon className="size-3.5" />
      </Button>
    </>
  );

  return (
    <GitPanelShell mode={mode} header={header}>
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        {/* Always-visible changes section (resizable) */}
        <div className="shrink-0 overflow-auto" style={{ height: changesHeight ?? "50%" }}>
          <ChangesSection gitCwd={gitCwd} threadId={threadId} />
        </div>

        {/* Drag handle */}
        <div
          className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-transparent transition-colors hover:bg-accent/40"
          onMouseDown={onDragStart}
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize"
        >
          <GripHorizontalIcon className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
        </div>

        {/* Tab bar */}
        <div className="no-drag flex shrink-0 items-center gap-0.5 border-b border-border px-2 py-1">
          {TAB_ITEMS.map((tab, i) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setActiveTab(threadId, tab.id)}
                    className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  />
                }
              >
                {tab.icon}
                {tab.label}
              </TooltipTrigger>
              <TooltipPopup side="bottom">
                {tab.label} ({i + 1})
              </TooltipPopup>
            </Tooltip>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">{tabContent}</div>

        {/* Activity Log */}
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => toggleActivityLog(threadId)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>Activity Log</span>
            {activityLogExpanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronUpIcon className="size-3.5" />
            )}
          </button>
          {activityLogExpanded && (
            <div className="border-t border-border">
              <Suspense fallback={null}>
                <ActivityLog threadId={threadId} gitCwd={gitCwd} />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </GitPanelShell>
  );
});

export default GitPanel;
