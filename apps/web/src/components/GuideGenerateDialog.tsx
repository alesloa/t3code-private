import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GuideDepth, GuideScope } from "@t3tools/contracts";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { useGuideStore } from "../guideStore";
import { toastManager } from "./ui/toast";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { RadioGroup, Radio } from "./ui/radio-group";

export interface GuideGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjectCwd?: string | undefined;
  initialScope?: GuideScope | undefined;
  initialTargetPath?: string | undefined;
}

const SCOPE_OPTIONS: { value: GuideScope; label: string; description: string }[] = [
  { value: "project", label: "Full Project", description: "Analyze the entire codebase" },
  { value: "directory", label: "Directory", description: "Focus on a specific directory" },
  { value: "file", label: "Single File", description: "Explain one file in depth" },
  { value: "topic", label: "Specific Topic", description: "Learn about a concept or system" },
];

const DEPTH_OPTIONS: { value: GuideDepth; label: string; description: string }[] = [
  { value: "quick", label: "Quick Explain", description: "Fast, focused explanation" },
  {
    value: "full",
    label: "Full Interactive Course",
    description: "Animations, quizzes, deep dive",
  },
];

export default function GuideGenerateDialog({
  open,
  onOpenChange,
  initialProjectCwd,
  initialScope,
  initialTargetPath,
}: GuideGenerateDialogProps) {
  const formId = useId();
  const projects = useStore((s) => s.projects);

  const [projectCwd, setProjectCwd] = useState(initialProjectCwd ?? projects[0]?.cwd ?? "");
  const [scope, setScope] = useState<GuideScope>(initialScope ?? "project");
  const [targetPath, setTargetPath] = useState(initialTargetPath ?? "");
  const [topicQuery, setTopicQuery] = useState("");
  const [depth, setDepth] = useState<GuideDepth>("quick");
  const [error, setError] = useState<string | null>(null);

  const prevOpenRef = useRef(open);
  if (open && !prevOpenRef.current) {
    setProjectCwd(initialProjectCwd ?? projects[0]?.cwd ?? "");
    setScope(initialScope ?? "project");
    setTargetPath(initialTargetPath ?? "");
    setTopicQuery("");
    setDepth("quick");
    setError(null);
  }
  prevOpenRef.current = open;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      return api.guides.generate({
        projectCwd,
        scope,
        targetPath: scope === "directory" || scope === "file" ? targetPath : "",
        depth,
        topicQuery: scope === "topic" ? topicQuery : undefined,
      });
    },
    onSuccess: (result) => {
      useGuideStore.getState().upsertGuide(result.guide);
      const timeEstimate =
        scope === "project"
          ? "This may take 5\u201315 minutes depending on codebase size."
          : scope === "topic"
            ? "This may take 3\u201310 minutes."
            : depth === "full"
              ? "This may take a few minutes."
              : "This usually takes 1\u20133 minutes.";
      toastManager.add({
        type: "info",
        title: "Guide generation started",
        description: timeEstimate,
      });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const showTargetPath = scope === "directory" || scope === "file";
  const showTopicQuery = scope === "topic";

  const canGenerate =
    projectCwd.trim().length > 0 &&
    (!showTargetPath || targetPath.trim().length > 0) &&
    (!showTopicQuery || topicQuery.trim().length > 0);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!canGenerate || generateMutation.isPending) return;
      generateMutation.mutate();
    },
    [canGenerate, generateMutation],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Guide</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
            {/* Project Picker */}
            <div className="space-y-1.5">
              <Label htmlFor="guide-project">Project</Label>
              <select
                id="guide-project"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={projectCwd}
                onChange={(e) => setProjectCwd(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.cwd}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <Label>Scope</Label>
              <RadioGroup value={scope} onValueChange={(val) => setScope(val as GuideScope)}>
                {SCOPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-accent/50 has-data-checked:border-ring has-data-checked:bg-accent/30"
                  >
                    <Radio value={opt.value} />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Target Path (for directory/file scope) */}
            {showTargetPath && (
              <div className="space-y-1.5">
                <Label htmlFor="guide-target">
                  {scope === "directory" ? "Directory Path" : "File Path"}
                </Label>
                <Input
                  id="guide-target"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder={
                    scope === "directory" ? "src/components" : "src/components/Sidebar.tsx"
                  }
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Relative path within the project</p>
              </div>
            )}

            {/* Topic Query (for topic scope) */}
            {showTopicQuery && (
              <div className="space-y-1.5">
                <Label htmlFor="guide-topic">What do you want to learn about?</Label>
                <Textarea
                  id="guide-topic"
                  value={topicQuery}
                  onChange={(e) => setTopicQuery(e.target.value)}
                  placeholder="How does the WebSocket reconnection work?"
                  autoFocus
                />
              </div>
            )}

            {/* Depth */}
            <div className="space-y-2">
              <Label>Depth</Label>
              <RadioGroup value={depth} onValueChange={(val) => setDepth(val as GuideDepth)}>
                {DEPTH_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-accent/50 has-data-checked:border-ring has-data-checked:bg-accent/30"
                  >
                    <Radio value={opt.value} />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!canGenerate || generateMutation.isPending}>
            {generateMutation.isPending ? "Starting..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
