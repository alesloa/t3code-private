import {
  BookOpenIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGuideStore } from "../guideStore";
import { useStore } from "../store";
import { readNativeApi } from "../nativeApi";
import type { GuideMeta, GuideScope } from "@t3tools/contracts";
import { toastManager } from "./ui/toast";
import { Collapsible, CollapsibleContent } from "./ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuAction,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function scopeIcon(scope: GuideScope) {
  switch (scope) {
    case "project":
      return <BookOpenIcon className="size-3 shrink-0 text-muted-foreground/70" />;
    case "directory":
      return <FolderIcon className="size-3 shrink-0 text-muted-foreground/70" />;
    case "file":
      return <FileTextIcon className="size-3 shrink-0 text-muted-foreground/70" />;
    case "topic":
      return <SparklesIcon className="size-3 shrink-0 text-muted-foreground/70" />;
  }
}

function getServerHttpOrigin(): string {
  const bridgeUrl = window.desktopBridge?.getWsUrl();
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsUrl =
    bridgeUrl && bridgeUrl.length > 0
      ? bridgeUrl
      : envUrl && envUrl.length > 0
        ? envUrl
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`;
  const httpUrl = wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    return new URL(httpUrl).origin;
  } catch {
    return httpUrl;
  }
}

const serverHttpOrigin = getServerHttpOrigin();
const loadedFaviconSrcs = new Set<string>();

function ProjectFavicon({ cwd }: { cwd: string }) {
  const src = `${serverHttpOrigin}/api/project-favicon?cwd=${encodeURIComponent(cwd)}`;
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    loadedFaviconSrcs.has(src) ? "loaded" : "loading",
  );

  if (status === "error") {
    return <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/50" />;
  }

  return (
    <img
      src={src}
      alt=""
      className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loading" ? "hidden" : ""}`}
      onLoad={() => {
        loadedFaviconSrcs.add(src);
        setStatus("loaded");
      }}
      onError={() => setStatus("error")}
    />
  );
}

// ── Types ────────────────────────────────────────────────────────────

interface GuidesSidebarProps {
  onRequestNewGuide: (projectCwd?: string) => void;
}

interface ProjectGuideGroup {
  cwd: string;
  name: string;
  guides: GuideMeta[];
}

// ── Component ────────────────────────────────────────────────────────

export default function GuidesSidebar({ onRequestNewGuide }: GuidesSidebarProps) {
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const guides = useGuideStore((s) => s.guides);
  const activeGenerations = useGuideStore((s) => s.activeGenerations);
  const setGuides = useGuideStore((s) => s.setGuides);
  const updateProgress = useGuideStore((s) => s.updateProgress);
  const [expandedCwds, setExpandedCwds] = useState<Set<string>>(() => new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Fetch guides on mount ────────────────────────────────────────
  const fetchGuides = useCallback(async () => {
    const api = readNativeApi();
    if (!api) return;
    try {
      setIsRefreshing(true);
      const result = await api.guides.list({});
      setGuides(result.guides);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to load guides",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [setGuides]);

  useEffect(() => {
    void fetchGuides();
  }, [fetchGuides]);

  // ── Subscribe to progress events ─────────────────────────────────
  useEffect(() => {
    const api = readNativeApi();
    if (!api) return;
    const unsubscribe = api.guides.onProgress((event) => {
      updateProgress(event);
    });
    return unsubscribe;
  }, [updateProgress]);

  // ── Group guides by project ──────────────────────────────────────
  const groupedProjects: ProjectGuideGroup[] = useMemo(() => {
    const guideByCwd = new Map<string, GuideMeta[]>();

    for (const guide of guides.values()) {
      const existing = guideByCwd.get(guide.projectCwd);
      if (existing) {
        existing.push(guide);
      } else {
        guideByCwd.set(guide.projectCwd, [guide]);
      }
    }

    // Include all known projects, even those with no guides
    const groups: ProjectGuideGroup[] = [];
    for (const project of projects) {
      const projectGuides = guideByCwd.get(project.cwd) ?? [];
      // Sort guides by updatedAt descending
      projectGuides.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      groups.push({
        cwd: project.cwd,
        name: project.name,
        guides: projectGuides,
      });
      guideByCwd.delete(project.cwd);
    }

    // Include orphaned guides (project CWDs not in the projects list)
    for (const [cwd, orphanGuides] of guideByCwd) {
      orphanGuides.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      const dirName = cwd.split("/").pop() ?? cwd;
      groups.push({ cwd, name: dirName, guides: orphanGuides });
    }

    return groups;
  }, [projects, guides]);

  // ── Expand/collapse ──────────────────────────────────────────────
  const toggleProjectExpanded = useCallback((cwd: string) => {
    setExpandedCwds((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) {
        next.delete(cwd);
      } else {
        next.add(cwd);
      }
      return next;
    });
  }, []);

  // Auto-expand projects that have guides
  useEffect(() => {
    const cwdsWithGuides = new Set<string>();
    for (const group of groupedProjects) {
      if (group.guides.length > 0) {
        cwdsWithGuides.add(group.cwd);
      }
    }
    setExpandedCwds((prev) => {
      const next = new Set(prev);
      for (const cwd of cwdsWithGuides) {
        next.add(cwd);
      }
      return next;
    });
  }, [groupedProjects]);

  // ── Context menu ─────────────────────────────────────────────────
  const handleGuideContextMenu = useCallback(
    async (guide: GuideMeta, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [
          { id: "view" as const, label: "View guide" },
          { id: "regenerate" as const, label: "Regenerate" },
          { id: "delete" as const, label: "Delete", destructive: true },
        ],
        position,
      );
      if (clicked === "view") {
        void navigate({ to: "/guide/$guideId", params: { guideId: guide.id } });
      } else if (clicked === "regenerate") {
        try {
          await api.guides.regenerate({ guideId: guide.id });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to regenerate guide",
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } else if (clicked === "delete") {
        const confirmed = await api.dialogs.confirm(`Delete guide "${guide.title}"?`);
        if (!confirmed) return;
        try {
          await api.guides.delete({ guideId: guide.id });
          useGuideStore.getState().removeGuide(guide.id);
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to delete guide",
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    },
    [navigate],
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SidebarGroup className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Guides
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Refresh guides"
                  disabled={isRefreshing}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void fetchGuides()}
                />
              }
            >
              <RefreshCwIcon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </TooltipTrigger>
            <TooltipPopup side="right">Refresh guides</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="New guide"
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onRequestNewGuide()}
                />
              }
            >
              <PlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="right">New guide</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      <SidebarMenu>
        {groupedProjects.map((group) => {
          const isExpanded = expandedCwds.has(group.cwd);
          return (
            <SidebarMenuItem key={group.cwd}>
              <Collapsible className="group/collapsible" open={isExpanded}>
                <div className="group/project-header relative">
                  <SidebarMenuButton
                    size="sm"
                    className="gap-2 px-2 py-1.5 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground"
                    onClick={() => toggleProjectExpanded(group.cwd)}
                  >
                    <ChevronRightIcon
                      className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <ProjectFavicon cwd={group.cwd} />
                    <span className="flex-1 truncate text-xs font-medium text-foreground/90">
                      {group.name}
                    </span>
                    {group.guides.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/40">
                        {group.guides.length}
                      </span>
                    )}
                  </SidebarMenuButton>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <SidebarMenuAction
                          render={
                            <button type="button" aria-label={`New guide in ${group.name}`} />
                          }
                          showOnHover
                          className="top-1 right-1 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onRequestNewGuide(group.cwd);
                          }}
                        >
                          <PlusIcon className="size-3.5" />
                        </SidebarMenuAction>
                      }
                    />
                    <TooltipPopup side="top">New guide in {group.name}</TooltipPopup>
                  </Tooltip>
                </div>

                <CollapsibleContent>
                  <SidebarMenuSub className="mx-1 my-0 w-full translate-x-0 gap-0.5 px-1.5 py-0">
                    {group.guides.length === 0 ? (
                      <SidebarMenuSubItem className="w-full">
                        <span className="px-2 py-1 text-[10px] text-muted-foreground/40 italic">
                          (no guides yet)
                        </span>
                      </SidebarMenuSubItem>
                    ) : (
                      group.guides.map((guide) => {
                        const generation = activeGenerations.get(guide.id);
                        const isGenerating =
                          guide.status === "generating" ||
                          guide.status === "queued" ||
                          !!generation;
                        const isFailed = guide.status === "failed";

                        return (
                          <SidebarMenuSubItem key={guide.id} className="w-full">
                            <SidebarMenuSubButton
                              render={<div role="button" tabIndex={0} />}
                              size="sm"
                              onClick={() => {
                                void navigate({
                                  to: "/guide/$guideId",
                                  params: { guideId: guide.id },
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                void navigate({
                                  to: "/guide/$guideId",
                                  params: { guideId: guide.id },
                                });
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                void handleGuideContextMenu(guide, {
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                                {scopeIcon(guide.scope)}
                                {guide.depth === "quick" && (
                                  <ZapIcon className="size-2.5 shrink-0 text-amber-500/70" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-xs">
                                  {guide.title}
                                </span>
                              </div>
                              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                                {isGenerating && (
                                  <LoaderIcon className="size-3 animate-spin text-muted-foreground/60" />
                                )}
                                {isFailed && !isGenerating && (
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={
                                        <span className="inline-flex items-center">
                                          <XCircleIcon className="size-3 text-destructive/70" />
                                        </span>
                                      }
                                    />
                                    <TooltipPopup side="top">
                                      {guide.errorMessage ?? "Generation failed"}
                                    </TooltipPopup>
                                  </Tooltip>
                                )}
                                <span className="text-[10px] text-muted-foreground/40">
                                  {formatRelativeTime(guide.updatedAt)}
                                </span>
                              </div>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })
                    )}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
