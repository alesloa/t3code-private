import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { CliSessionMessage, CliSessionSource, ModelSelection } from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import { ArrowLeftIcon, ChevronDownIcon, GitForkIcon, Loader2Icon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";

import { readNativeApi } from "../nativeApi";
import { newCommandId, newThreadId } from "../lib/utils";
import { useStore } from "../store";
import { toastManager } from "./ui/toast";
import { ClaudeAI, OpenAI } from "./Icons";
import { isElectron } from "../env";
import { SidebarTrigger } from "./ui/sidebar";
import { Button } from "./ui/button";
import ChatMarkdown from "./ChatMarkdown";
import { cn } from "../lib/utils";

const NEAR_BOTTOM_THRESHOLD_PX = 64;

interface CliSessionViewProps {
  source: CliSessionSource;
  filePath: string;
  title?: string | undefined;
}

export const CliSessionView = memo(function CliSessionView({
  source,
  filePath,
  title,
}: CliSessionViewProps) {
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const activeProjectId = projects[0]?.id;
  const projectCwd = projects[0]?.cwd;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cliSessionMessages", source, filePath],
    queryFn: async () => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      return api.cliSessions.readMessages({ source, filePath });
    },
  });

  const handleFork = useCallback(
    async (provider: "codex" | "claudeAgent") => {
      const api = readNativeApi();
      if (!api || !data?.messages.length || !activeProjectId) return;

      try {
        const threadId = newThreadId();
        const modelSelection: ModelSelection =
          provider === "codex"
            ? { provider: "codex", model: DEFAULT_MODEL_BY_PROVIDER.codex }
            : { provider: "claudeAgent", model: DEFAULT_MODEL_BY_PROVIDER.claudeAgent };

        await api.orchestration.dispatchCommand({
          type: "thread.import",
          commandId: newCommandId(),
          threadId,
          projectId: activeProjectId,
          title: `Imported: ${title ?? "CLI Session"}`,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          messages: data.messages.map((m) => ({ role: m.role, text: m.text })),
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
    [data, activeProjectId, title, navigate],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
    setShowScrollToBottom(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const SourceIcon = source === "claude" ? ClaudeAI : OpenAI;
  const sourceLabel = source === "claude" ? "Claude Code" : "Codex";
  const displayTitle = title ?? "CLI Session";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
      {/* Header */}
      <header
        className={cn(
          "border-b border-border px-3 sm:px-5",
          isElectron ? "drag-region flex h-[52px] items-center" : "py-2 sm:py-3",
        )}
      >
        <div className="flex w-full items-center gap-2">
          {!isElectron && <SidebarTrigger className="size-7 shrink-0 md:hidden" />}
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className="flex shrink-0 items-center text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <SourceIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{displayTitle}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {sourceLabel} &middot; read-only
          </span>
          <div className="flex-1" />
          {source === "claude" ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => void handleFork("codex")}
              disabled={!data?.messages.length || !activeProjectId}
            >
              <GitForkIcon className="mr-1.5 size-3.5" />
              Fork to Codex
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => void handleFork("claudeAgent")}
              disabled={!data?.messages.length || !activeProjectId}
            >
              <GitForkIcon className="mr-1.5 size-3.5" />
              Fork to Claude
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
          >
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-sm text-destructive">
                Failed to load messages: {String(error)}
              </div>
            )}
            {data && data.messages.length === 0 && (
              <div className="flex flex-1 items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No messages found in this session.</p>
              </div>
            )}
            {data &&
              data.messages.length > 0 &&
              data.messages.map((msg) => {
                const key = `${msg.role}-${msg.timestamp}-${msg.text.slice(0, 32)}`;
                return <CliMessageRow key={key} message={msg} cwd={projectCwd} />;
              })}
          </div>

          {/* Scroll to bottom pill — same as ChatView */}
          {showScrollToBottom && (
            <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:cursor-pointer hover:border-border hover:text-foreground"
              >
                <ChevronDownIcon className="size-3.5" />
                Scroll to bottom
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const CliMessageRow = memo(function CliMessageRow({
  message,
  cwd,
}: {
  message: CliSessionMessage;
  cwd: string | undefined;
}) {
  if (message.role === "user") {
    return (
      <div className="pb-4">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3">
            <div className="whitespace-pre-wrap text-sm">{message.text}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="min-w-0 px-1 py-0.5">
        <ChatMarkdown text={message.text} cwd={cwd} />
      </div>
    </div>
  );
});
