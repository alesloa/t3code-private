import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GitPanelTab = "changes" | "graph" | "branches" | "worktrees" | "stash" | "prs";

export interface ActivityLogEntry {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  output: string;
  timestamp: number;
  durationMs?: number;
}

interface ThreadGitPanelState {
  open: boolean;
  activeTab: GitPanelTab;
  activityLogExpanded: boolean;
  commitMessage: string;
}

const GIT_PANEL_STATE_STORAGE_KEY = "t3code:git-panel-state:v1";

const DEFAULT_THREAD_STATE: ThreadGitPanelState = Object.freeze({
  open: false,
  activeTab: "changes" as GitPanelTab,
  activityLogExpanded: false,
  commitMessage: "",
});

function selectThreadState(
  stateByThreadId: Record<string, ThreadGitPanelState>,
  threadId: ThreadId,
): ThreadGitPanelState {
  return stateByThreadId[threadId] ?? DEFAULT_THREAD_STATE;
}

function isDefaultState(state: ThreadGitPanelState): boolean {
  return !state.open && state.commitMessage === "" && !state.activityLogExpanded;
}

interface GitPanelStoreState {
  stateByThreadId: Record<string, ThreadGitPanelState>;
  activityLog: ActivityLogEntry[];
  openPanel: (threadId: ThreadId, tab?: GitPanelTab) => void;
  closePanel: (threadId: ThreadId) => void;
  setActiveTab: (threadId: ThreadId, tab: GitPanelTab) => void;
  setCommitMessage: (threadId: ThreadId, message: string) => void;
  toggleActivityLog: (threadId: ThreadId) => void;
  addLogEntry: (entry: ActivityLogEntry) => void;
  updateLogEntry: (
    id: string,
    updates: Partial<Pick<ActivityLogEntry, "status" | "output" | "durationMs">>,
  ) => void;
  clearLog: () => void;
  removeOrphanedStates: (activeThreadIds: Set<ThreadId>) => void;
}

export const useGitPanelStore = create<GitPanelStoreState>()(
  persist(
    (set) => {
      const updateThread = (
        threadId: ThreadId,
        updater: (state: ThreadGitPanelState) => ThreadGitPanelState,
      ) => {
        set((store) => {
          const current = selectThreadState(store.stateByThreadId, threadId);
          const next = updater(current);
          if (next === current) return store;

          if (isDefaultState(next)) {
            if (store.stateByThreadId[threadId] === undefined) return store;
            const { [threadId]: _removed, ...rest } = store.stateByThreadId;
            return { stateByThreadId: rest };
          }

          return {
            stateByThreadId: { ...store.stateByThreadId, [threadId]: next },
          };
        });
      };

      return {
        stateByThreadId: {},
        activityLog: [],

        openPanel: (threadId, tab) =>
          updateThread(threadId, (state) => ({
            ...state,
            open: true,
            ...(tab !== undefined ? { activeTab: tab } : {}),
          })),

        closePanel: (threadId) =>
          updateThread(threadId, (state) => {
            if (!state.open) return state;
            return { ...state, open: false };
          }),

        setActiveTab: (threadId, tab) =>
          updateThread(threadId, (state) => {
            if (state.activeTab === tab) return state;
            return { ...state, activeTab: tab };
          }),

        setCommitMessage: (threadId, message) =>
          updateThread(threadId, (state) => {
            if (state.commitMessage === message) return state;
            return { ...state, commitMessage: message };
          }),

        toggleActivityLog: (threadId) =>
          updateThread(threadId, (state) => ({
            ...state,
            activityLogExpanded: !state.activityLogExpanded,
          })),

        addLogEntry: (entry) =>
          set((store) => ({
            activityLog: [...store.activityLog, entry],
          })),

        updateLogEntry: (id, updates) =>
          set((store) => {
            const idx = store.activityLog.findIndex((e) => e.id === id);
            if (idx === -1) return store;
            const entry = store.activityLog[idx]!;
            const updated = [...store.activityLog];
            updated[idx] = {
              ...entry,
              ...(updates.status !== undefined ? { status: updates.status } : {}),
              ...(updates.output !== undefined ? { output: updates.output } : {}),
              ...(updates.durationMs !== undefined ? { durationMs: updates.durationMs } : {}),
            };
            return { activityLog: updated };
          }),

        clearLog: () => set({ activityLog: [] }),

        removeOrphanedStates: (activeThreadIds) =>
          set((store) => {
            const orphanedIds = Object.keys(store.stateByThreadId).filter(
              (id) => !activeThreadIds.has(id as ThreadId),
            );
            if (orphanedIds.length === 0) return store;
            const next = { ...store.stateByThreadId };
            for (const id of orphanedIds) {
              delete next[id];
            }
            return { stateByThreadId: next };
          }),
      };
    },
    {
      name: GIT_PANEL_STATE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        stateByThreadId: state.stateByThreadId,
      }),
    },
  ),
);
