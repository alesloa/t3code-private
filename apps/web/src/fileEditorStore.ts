import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface FileEditorTab {
  relativePath: string;
  cwd: string;
}

// Virtual tab prefix for "Generate Image" mode (no existing file)
export const GENERATE_IMAGE_PREFIX = "__generate_image__/";

interface ThreadFileEditorState {
  open: boolean;
  tabs: FileEditorTab[];
  activeTabIndex: number;
}

const FILE_EDITOR_STATE_STORAGE_KEY = "t3code:file-editor-state:v1";

const DEFAULT_THREAD_FILE_EDITOR_STATE: ThreadFileEditorState = Object.freeze({
  open: false,
  tabs: [],
  activeTabIndex: 0,
});

function selectThreadState(
  stateByThreadId: Record<string, ThreadFileEditorState>,
  threadId: ThreadId,
): ThreadFileEditorState {
  return stateByThreadId[threadId] ?? DEFAULT_THREAD_FILE_EDITOR_STATE;
}

function isDefaultState(state: ThreadFileEditorState): boolean {
  return !state.open && state.tabs.length === 0;
}

interface FileEditorStoreState {
  stateByThreadId: Record<string, ThreadFileEditorState>;
  openFile: (threadId: ThreadId, cwd: string, relativePath: string) => void;
  closeTab: (threadId: ThreadId, index: number) => void;
  setActiveTab: (threadId: ThreadId, index: number) => void;
  closePanel: (threadId: ThreadId) => void;
  removeOrphanedStates: (activeThreadIds: Set<ThreadId>) => void;
}

export const useFileEditorStore = create<FileEditorStoreState>()(
  persist(
    (set) => {
      const updateThread = (
        threadId: ThreadId,
        updater: (state: ThreadFileEditorState) => ThreadFileEditorState,
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

        openFile: (threadId, cwd, relativePath) =>
          updateThread(threadId, (state) => {
            const existingIndex = state.tabs.findIndex(
              (tab) => tab.cwd === cwd && tab.relativePath === relativePath,
            );
            if (existingIndex >= 0) {
              return { ...state, open: true, activeTabIndex: existingIndex };
            }
            const newTabs = [...state.tabs, { cwd, relativePath }];
            return { open: true, tabs: newTabs, activeTabIndex: newTabs.length - 1 };
          }),

        closeTab: (threadId, index) =>
          updateThread(threadId, (state) => {
            if (index < 0 || index >= state.tabs.length) return state;
            const newTabs = state.tabs.filter((_, i) => i !== index);
            if (newTabs.length === 0) {
              return { ...DEFAULT_THREAD_FILE_EDITOR_STATE };
            }
            const newActiveIndex = Math.min(state.activeTabIndex, newTabs.length - 1);
            return { ...state, tabs: newTabs, activeTabIndex: newActiveIndex };
          }),

        setActiveTab: (threadId, index) =>
          updateThread(threadId, (state) => {
            if (index < 0 || index >= state.tabs.length) return state;
            if (state.activeTabIndex === index) return state;
            return { ...state, activeTabIndex: index };
          }),

        closePanel: (threadId) =>
          updateThread(threadId, (state) => {
            if (!state.open) return state;
            return { ...state, open: false };
          }),

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
      name: FILE_EDITOR_STATE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        stateByThreadId: state.stateByThreadId,
      }),
    },
  ),
);
