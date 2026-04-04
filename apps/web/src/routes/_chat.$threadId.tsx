import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useState } from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useFileEditorStore } from "../fileEditorStore";
import { useGitPanelStore } from "../gitPanelStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const FileEditorPanel = lazy(() => import("../components/FileEditorPanel"));
const GitPanel = lazy(() => import("../components/GitPanel"));

const RIGHT_PANEL_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const RIGHT_PANEL_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const RIGHT_PANEL_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const RightPanelSheet = (props: { children: ReactNode; open: boolean; onClose: () => void }) => {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const LazyFileEditorPanel = (props: { mode: "sheet" | "sidebar" }) => {
  return (
    <Suspense fallback={null}>
      <FileEditorPanel mode={props.mode} />
    </Suspense>
  );
};

const LazyGitPanel = (props: { mode: "sheet" | "sidebar"; threadId: ThreadId }) => {
  return (
    <Suspense fallback={null}>
      <GitPanel mode={props.mode} threadId={props.threadId} />
    </Suspense>
  );
};

const RightPanelInlineSidebar = (props: {
  open: boolean;
  onClose: () => void;
  onOpenDiff: () => void;
  children: ReactNode;
}) => {
  const { open, onClose, onOpenDiff, children } = props;
  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenDiff();
        return;
      }
      onClose();
    },
    [onClose, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={open}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": RIGHT_PANEL_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: RIGHT_PANEL_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {children}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function ChatThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const diffOpen = search.diff === "1";
  const shouldUseSheet = useMediaQuery(RIGHT_PANEL_LAYOUT_MEDIA_QUERY);

  // File editor store state
  const editorOpen = useFileEditorStore((s) => s.stateByThreadId[threadId]?.open ?? false);
  const closeEditorPanel = useFileEditorStore((s) => s.closePanel);

  // Git panel store state
  const gitPanelOpen = useGitPanelStore((s) => s.stateByThreadId[threadId]?.open ?? false);
  const closeGitPanel = useGitPanelStore((s) => s.closePanel);

  // TanStack Router keeps active route components mounted across param-only navigations
  // unless remountDeps are configured, so this stays warm across thread switches.
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const [hasOpenedEditor, setHasOpenedEditor] = useState(editorOpen);
  const [hasOpenedGitPanel, setHasOpenedGitPanel] = useState(gitPanelOpen);

  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId]);

  const openDiff = useCallback(() => {
    // Mutual exclusion: close editor and git panel when opening diff
    closeEditorPanel(threadId);
    closeGitPanel(threadId);
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId, closeEditorPanel, closeGitPanel]);

  // Close the right panel (whichever is open)
  const closeRightPanel = useCallback(() => {
    if (diffOpen) {
      closeDiff();
    }
    if (editorOpen) {
      closeEditorPanel(threadId);
    }
    if (gitPanelOpen) {
      closeGitPanel(threadId);
    }
  }, [diffOpen, editorOpen, gitPanelOpen, closeDiff, closeEditorPanel, closeGitPanel, threadId]);

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  useEffect(() => {
    if (editorOpen) {
      setHasOpenedEditor(true);
      // Mutual exclusion: close git panel when editor opens
      if (gitPanelOpen) closeGitPanel(threadId);
    }
  }, [editorOpen, gitPanelOpen, closeGitPanel, threadId]);

  useEffect(() => {
    if (gitPanelOpen) {
      setHasOpenedGitPanel(true);
      // Mutual exclusion: close other panels when git panel opens
      if (diffOpen) closeDiff();
      if (editorOpen) closeEditorPanel(threadId);
    }
  }, [gitPanelOpen, diffOpen, editorOpen, closeDiff, closeEditorPanel, threadId]);

  // Keyboard shortcut: Cmd+Shift+G / Ctrl+Shift+G to toggle git panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "G" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const openPanel = useGitPanelStore.getState().openPanel;
        const close = useGitPanelStore.getState().closePanel;
        if (gitPanelOpen) {
          close(threadId);
        } else {
          openPanel(threadId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [threadId, gitPanelOpen]);

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [navigate, routeThreadExists, threadsHydrated, threadId]);

  if (!threadsHydrated || !routeThreadExists) {
    return null;
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;
  const shouldRenderEditorContent = editorOpen || hasOpenedEditor;
  const shouldRenderGitPanel = gitPanelOpen || hasOpenedGitPanel;

  // Determine which panel is active (git panel > editor > diff priority)
  const rightPanelOpen = gitPanelOpen || editorOpen || diffOpen;

  // Build the right panel content
  const panelMode = shouldUseSheet ? "sheet" : "sidebar";
  const rightPanelContent = gitPanelOpen ? (
    shouldRenderGitPanel ? (
      <LazyGitPanel mode={panelMode} threadId={threadId} />
    ) : null
  ) : editorOpen ? (
    shouldRenderEditorContent ? (
      <LazyFileEditorPanel mode={panelMode} />
    ) : null
  ) : shouldRenderDiffContent ? (
    <LazyDiffPanel mode={panelMode} />
  ) : null;

  if (!shouldUseSheet) {
    return (
      <>
        <SidebarInset className="h-dvh  min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView key={threadId} threadId={threadId} />
        </SidebarInset>
        <RightPanelInlineSidebar
          open={rightPanelOpen}
          onClose={closeRightPanel}
          onOpenDiff={openDiff}
        >
          {rightPanelContent}
        </RightPanelInlineSidebar>
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView key={threadId} threadId={threadId} />
      </SidebarInset>
      <RightPanelSheet open={rightPanelOpen} onClose={closeRightPanel}>
        {rightPanelContent}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
