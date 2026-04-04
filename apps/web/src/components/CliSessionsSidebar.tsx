import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
  CliSessionMeta,
  CliSessionSource,
  ModelSelection,
  ProjectId,
} from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import { ChevronRightIcon, Loader2Icon, RefreshCwIcon, TerminalIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { readNativeApi } from "../nativeApi";
import { newCommandId, newThreadId } from "../lib/utils";
import { toastManager } from "./ui/toast";
import { ClaudeAI, OpenAI } from "./Icons";
import { Collapsible, CollapsibleContent } from "./ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./ui/sidebar";
import { ToggleGroup, Toggle } from "./ui/toggle-group";

interface CliSessionsSidebarProps {
  projectCwd: string;
  projectId: ProjectId;
}

export const CliSessionsSidebar = memo(function CliSessionsSidebar({
  projectCwd,
  projectId,
}: CliSessionsSidebarProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CliSessionSource>("claude");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cliSessionsScan", projectCwd],
    queryFn: async () => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      return api.cliSessions.scan({ cwd: projectCwd });
    },
    enabled: open,
    staleTime: 60_000,
  });

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["cliSessionsScan", projectCwd],
    });
  }, [queryClient, projectCwd]);

  const handleSessionClick = useCallback(
    (session: CliSessionMeta) => {
      void navigate({
        to: "/cli-session",
        search: {
          source: session.source,
          filePath: session.filePath,
          title: session.title,
        },
      });
    },
    [navigate],
  );

  const handleFork = useCallback(
    async (session: CliSessionMeta, provider: "codex" | "claudeAgent") => {
      const api = readNativeApi();
      if (!api) return;

      try {
        const { messages } = await api.cliSessions.readMessages({
          source: session.source,
          filePath: session.filePath,
        });
        if (!messages.length) {
          toastManager.add({
            title: "No messages",
            description: "This session has no messages to fork.",
          });
          return;
        }

        const modelSelection: ModelSelection =
          provider === "codex"
            ? { provider: "codex", model: DEFAULT_MODEL_BY_PROVIDER.codex }
            : { provider: "claudeAgent", model: DEFAULT_MODEL_BY_PROVIDER.claudeAgent };

        const threadId = newThreadId();
        await api.orchestration.dispatchCommand({
          type: "thread.import",
          commandId: newCommandId(),
          threadId,
          projectId,
          title: session.title,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          messages: messages.map((m) => ({ role: m.role, text: m.text })),
          createdAt: new Date().toISOString(),
        });

        void navigate({ to: "/$threadId", params: { threadId } });
      } catch (err) {
        toastManager.add({
          type: "error",
          title: "Failed to fork session",
          description: String(err),
        });
      }
    },
    [projectId, navigate],
  );

  const handleContextMenu = useCallback(
    async (event: React.MouseEvent, session: CliSessionMeta) => {
      event.preventDefault();
      const api = readNativeApi();
      if (!api) return;

      const options =
        session.source === "claude"
          ? [
              { id: "fork-claude" as const, label: "Continue with Claude" },
              { id: "fork-codex" as const, label: "Continue with Codex" },
            ]
          : [
              { id: "fork-codex" as const, label: "Continue with Codex" },
              { id: "fork-claude" as const, label: "Continue with Claude" },
            ];
      const result = await api.contextMenu.show(options, {
        x: event.clientX,
        y: event.clientY,
      });
      if (result === "fork-codex") {
        void handleFork(session, "codex");
      } else if (result === "fork-claude") {
        void handleFork(session, "claudeAgent");
      }
    },
    [handleFork],
  );

  const activeSessions = data?.[activeTab];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuButton
        size="sm"
        className="mt-1 gap-1.5 px-2 py-1 text-left text-[11px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <TerminalIcon className="size-3 shrink-0" />
        <span>Local Sessions</span>
      </SidebarMenuButton>

      <CollapsibleContent>
        <div className="mx-3 mt-1 flex items-center gap-1">
          <ToggleGroup
            value={[activeTab]}
            onValueChange={(val) => {
              if (val.length > 0) setActiveTab(val[0] as CliSessionSource);
            }}
            className="h-6 gap-0 rounded-md border border-border"
          >
            <Toggle
              value="claude"
              size="sm"
              className="h-5 rounded-none rounded-l-[5px] px-2 text-[10px]"
            >
              <ClaudeAI className="mr-1 size-3" />
              Claude
            </Toggle>
            <Toggle
              value="codex"
              size="sm"
              className="h-5 rounded-none rounded-r-[5px] px-2 text-[10px]"
            >
              <OpenAI className="mr-1 size-3" />
              Codex
            </Toggle>
          </ToggleGroup>
          <button
            type="button"
            className="ml-auto flex size-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground"
            onClick={handleRefresh}
            title="Refresh sessions"
          >
            <RefreshCwIcon className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <SidebarMenuSub className="mx-1 my-1 w-full translate-x-0 gap-0.5 px-1.5 py-0">
          {isLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground/50" />
            </div>
          )}

          {!isLoading && activeSessions && !activeSessions.available && (
            <div className="px-2 py-2 text-[10px] text-muted-foreground/50">
              {activeTab === "claude" ? "Claude Code CLI not detected" : "Codex CLI not detected"}
            </div>
          )}

          {!isLoading &&
            activeSessions &&
            activeSessions.available &&
            activeSessions.sessions.length === 0 && (
              <div className="px-2 py-2 text-[10px] text-muted-foreground/50">
                No sessions found
              </div>
            )}

          {!isLoading &&
            activeSessions &&
            activeSessions.available &&
            activeSessions.sessions.map((session) => (
              <SidebarMenuSubItem key={session.id} className="w-full">
                <SidebarMenuSubButton
                  render={<button type="button" />}
                  size="sm"
                  className="h-6 w-full translate-x-0 gap-1.5 px-2 text-left"
                  onClick={() => handleSessionClick(session)}
                  onContextMenu={(e) => void handleContextMenu(e, session)}
                >
                  {session.source === "claude" ? (
                    <ClaudeAI className="size-3 shrink-0 text-muted-foreground/50" />
                  ) : (
                    <OpenAI className="size-3 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="truncate text-[11px]">{session.title}</span>
                  {session.updatedAt && (
                    <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/40">
                      {formatRelativeTimestamp(session.updatedAt)}
                    </span>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
});

function formatRelativeTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo`;
}
