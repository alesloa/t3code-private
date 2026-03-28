import { create } from "zustand";
import type { GuideMeta, GuideProgressEvent, GuideScope } from "@t3tools/contracts";

export interface GuideDialogState {
  open: boolean;
  initialProjectCwd?: string;
  initialScope?: GuideScope;
  initialTargetPath?: string;
}

interface GuideStore {
  /** All known guide metadata, keyed by guideId */
  guides: Map<string, GuideMeta>;
  /** Active generation progress events */
  activeGenerations: Map<string, GuideProgressEvent>;
  /** Currently selected guide ID for viewing */
  selectedGuideId: string | null;
  /** Whether the guides sidebar tab is active */
  guidesTabActive: boolean;
  /** Generate guide dialog state */
  generateDialog: GuideDialogState;

  setGuides: (guides: readonly GuideMeta[]) => void;
  upsertGuide: (guide: GuideMeta) => void;
  removeGuide: (guideId: string) => void;
  updateProgress: (event: GuideProgressEvent) => void;
  selectGuide: (guideId: string | null) => void;
  setGuidesTabActive: (active: boolean) => void;
  openGenerateDialog: (initial?: Omit<GuideDialogState, "open">) => void;
  closeGenerateDialog: () => void;
}

export const useGuideStore = create<GuideStore>((set) => ({
  guides: new Map(),
  activeGenerations: new Map(),
  selectedGuideId: null,
  guidesTabActive: false,
  generateDialog: { open: false },

  setGuides: (guides) =>
    set(() => ({
      guides: new Map(guides.map((g) => [g.id, g])),
    })),

  upsertGuide: (guide) =>
    set((state) => {
      const next = new Map(state.guides);
      next.set(guide.id, guide);
      return { guides: next };
    }),

  removeGuide: (guideId) =>
    set((state) => {
      const next = new Map(state.guides);
      next.delete(guideId);
      const activeGenerations = new Map(state.activeGenerations);
      activeGenerations.delete(guideId);
      return {
        guides: next,
        activeGenerations,
        selectedGuideId: state.selectedGuideId === guideId ? null : state.selectedGuideId,
      };
    }),

  updateProgress: (event) =>
    set((state) => {
      const activeGenerations = new Map(state.activeGenerations);
      if (event.status === "completed" || event.status === "failed") {
        activeGenerations.delete(event.guideId);
      } else {
        activeGenerations.set(event.guideId, event);
      }
      // If updatedMeta is provided, upsert the guide
      const guides = event.updatedMeta ? new Map(state.guides) : state.guides;
      if (event.updatedMeta) {
        guides.set(event.guideId, event.updatedMeta);
      }
      return { activeGenerations, guides };
    }),

  selectGuide: (guideId) => set({ selectedGuideId: guideId }),

  setGuidesTabActive: (active) => set({ guidesTabActive: active }),

  openGenerateDialog: (initial) => set({ generateDialog: { open: true, ...initial } }),

  closeGenerateDialog: () => set({ generateDialog: { open: false } }),
}));
