import { type ThreadId } from "@t3tools/contracts";
import { CheckCircleIcon, CircleDotIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { type ActivityLogEntry, useGitPanelStore } from "~/gitPanelStore";
import { readNativeApi } from "~/nativeApi";

function LogEntry({ entry }: { entry: ActivityLogEntry }) {
  const statusIcon =
    entry.status === "running" ? (
      <CircleDotIcon className="size-3 shrink-0 animate-pulse text-info" />
    ) : entry.status === "success" ? (
      <CheckCircleIcon className="size-3 shrink-0 text-success" />
    ) : (
      <XCircleIcon className="size-3 shrink-0 text-destructive" />
    );

  const durationLabel =
    entry.durationMs !== undefined ? `${(entry.durationMs / 1000).toFixed(1)}s` : null;

  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className="mt-0.5">{statusIcon}</span>
      <div className="min-w-0 flex-1">
        <span className="font-mono">{entry.command}</span>
        {durationLabel && <span className="ml-1 text-muted-foreground/70">({durationLabel})</span>}
        {entry.status === "error" && entry.output && (
          <pre className="mt-0.5 whitespace-pre-wrap break-all text-destructive/80">
            {entry.output}
          </pre>
        )}
      </div>
    </div>
  );
}

export default memo(function ActivityLog({
  gitCwd,
}: {
  threadId: ThreadId;
  gitCwd: string | null;
}) {
  const entries = useGitPanelStore((s) => s.activityLog);
  const addLogEntry = useGitPanelStore((s) => s.addLogEntry);
  const updateLogEntry = useGitPanelStore((s) => s.updateLogEntry);
  const clearLog = useGitPanelStore((s) => s.clearLog);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to git action progress events
  useEffect(() => {
    const api = readNativeApi();
    if (!api) return;

    return api.git.onActionProgress((event) => {
      if (gitCwd && event.cwd !== gitCwd) return;

      if (event.kind === "action_started") {
        addLogEntry({
          id: event.actionId,
          command: `git ${event.action}`,
          status: "running",
          output: "",
          timestamp: Date.now(),
        });
      } else if (event.kind === "phase_started") {
        updateLogEntry(event.actionId, { output: event.label });
      } else if (event.kind === "hook_output") {
        updateLogEntry(event.actionId, { output: event.text });
      } else if (event.kind === "action_finished") {
        updateLogEntry(event.actionId, {
          status: "success",
          durationMs:
            Date.now() - (entries.find((e) => e.id === event.actionId)?.timestamp ?? Date.now()),
        });
      } else if (event.kind === "action_failed") {
        updateLogEntry(event.actionId, {
          status: "error",
          output: event.message,
          durationMs:
            Date.now() - (entries.find((e) => e.id === event.actionId)?.timestamp ?? Date.now()),
        });
      }
    });
  }, [addLogEntry, updateLogEntry, gitCwd, entries]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No activity yet.</div>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end px-3 py-0.5">
        <Button variant="ghost" size="icon-xs" onClick={clearLog} aria-label="Clear activity log">
          <Trash2Icon className="size-3" />
        </Button>
      </div>
      <div ref={scrollRef} className="max-h-32 overflow-auto px-3 pb-2 text-xs">
        {entries.map((entry) => (
          <LogEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
});
