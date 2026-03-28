import { createFileRoute } from "@tanstack/react-router";
import {
  BlocksIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  GithubIcon,
  GlobeIcon,
  LoaderIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { Skill } from "@t3tools/contracts";
import { type FormEvent, useCallback, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../components/ui/menu";
import { Textarea } from "../components/ui/textarea";
import { isElectron } from "../env";
import { ensureNativeApi } from "../nativeApi";
import { skillsQueryKeys } from "../lib/skillsReactQuery";
import { useStore } from "../store";

// ── Gradient palette for skill avatars ──────────────────────────────

const AVATAR_GRADIENTS = [
  "from-violet-600 to-indigo-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-500 to-green-600",
  "from-cyan-500 to-teal-500",
  "from-red-500 to-rose-600",
  "from-indigo-500 to-violet-600",
];

function gradientForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

function dirNameFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Skill Avatar ────────────────────────────────────────────────────

function SkillAvatar({
  skill,
  size = "md",
  onClick,
}: {
  skill: Skill;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const sizeClasses = size === "sm" ? "size-9" : size === "lg" ? "size-14" : "size-11";
  const textSize = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-lg";
  const roundedClass = size === "lg" ? "rounded-2xl" : "rounded-xl";

  if (skill.iconBase64) {
    return (
      <button
        type="button"
        className={`${sizeClasses} shrink-0 overflow-hidden ${roundedClass} transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring ${onClick ? "cursor-pointer" : "cursor-default"}`}
        onClick={onClick}
        tabIndex={onClick ? 0 : -1}
      >
        <img src={skill.iconBase64} alt={skill.name} className="size-full object-cover" />
      </button>
    );
  }

  const gradient = gradientForName(skill.name);
  const letter = skill.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      className={`${sizeClasses} shrink-0 overflow-hidden ${roundedClass} bg-gradient-to-br ${gradient} flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring ${onClick ? "cursor-pointer" : "cursor-default"}`}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
    >
      <span className={`${textSize} font-semibold text-white drop-shadow-sm`}>{letter}</span>
    </button>
  );
}

// ── Skill Card ──────────────────────────────────────────────────────

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <button
      type="button"
      className="group relative flex w-full cursor-pointer items-start gap-3.5 rounded-xl border border-border/50 bg-card/50 p-3.5 text-left transition-all duration-200 hover:border-border hover:bg-accent/40"
      onClick={onClick}
    >
      <SkillAvatar skill={skill} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{skill.name}</h3>
          {skill.source?.type === "github" && (
            <GithubIcon className="size-3 shrink-0 text-muted-foreground/50" />
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
            {skill.description}
          </p>
        )}
        {skill.version && (
          <span className="mt-1 inline-block text-[10px] text-muted-foreground/40">
            v{skill.version}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Skill Editor Dialog ─────────────────────────────────────────────

function SkillEditorDialog({
  open,
  onOpenChange,
  skill,
  scopeCwd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
  scopeCwd: string | undefined;
}) {
  const isNew = skill === null;
  const queryClient = useQueryClient();
  const formId = useId();

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [allowedTools, setAllowedTools] = useState(skill?.allowedTools?.join(", ") ?? "");
  const [body, setBody] = useState(skill?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const resetForm = useCallback((s: Skill | null) => {
    setName(s?.name ?? "");
    setDescription(s?.description ?? "");
    setAllowedTools(s?.allowedTools?.join(", ") ?? "");
    setBody(s?.body ?? "");
    setError(null);
  }, []);

  const prevOpenRef = useRef(open);
  if (open && !prevOpenRef.current) {
    resetForm(skill);
  }
  prevOpenRef.current = open;

  const createMutation = useMutation({
    mutationFn: async () => {
      const api = ensureNativeApi();
      const toolsArray = allowedTools
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      return api.skills.create({
        dirName: dirNameFromName(name),
        name,
        description: description || undefined,
        allowedTools: toolsArray.length > 0 ? toolsArray : undefined,
        body,
        cwd: scopeCwd,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const api = ensureNativeApi();
      const toolsArray = allowedTools
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      return api.skills.update({
        dirName: skill!.dirName,
        name,
        description: description || undefined,
        allowedTools: toolsArray.length > 0 ? toolsArray : undefined,
        body,
        cwd: scopeCwd,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.skills.delete({ dirName: skill!.dirName, cwd: scopeCwd });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
      setShowDeleteConfirm(false);
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && body.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || isSaving) return;
    if (isNew) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="sm:max-w-2xl">
          <DialogHeader>
            {!isNew ? (
              <div className="flex items-start gap-4">
                <SkillAvatar skill={skill} size="lg" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">{skill.name}</DialogTitle>
                  {skill.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="mr-8 mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    const api = ensureNativeApi();
                    void api.skills.openFolder({ dirName: skill.dirName, cwd: scopeCwd });
                  }}
                >
                  Open folder
                  <ExternalLinkIcon className="size-3" />
                </button>
              </div>
            ) : (
              <DialogTitle>Create Skill</DialogTitle>
            )}
          </DialogHeader>
          <DialogPanel>
            <form id={formId} className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Skill"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-desc">Description</Label>
                <Input
                  id="skill-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this skill does and when to trigger it..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-tools">Allowed Tools</Label>
                <Input
                  id="skill-tools"
                  value={allowedTools}
                  onChange={(e) => setAllowedTools(e.target.value)}
                  placeholder="Read, Write, Bash"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-body">Instructions</Label>
                <Textarea
                  id="skill-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="# Skill instructions in markdown..."
                  rows={8}
                  className="max-h-[40vh] font-mono text-xs"
                />
              </div>

              {error && <p className="text-xs text-destructive-foreground">{error}</p>}
            </form>
          </DialogPanel>
          <DialogFooter>
            {!isNew && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto text-destructive-foreground border-destructive/40 hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Uninstall
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form={formId} type="submit" size="sm" disabled={!canSave || isSaving}>
              {isSaving ? <LoaderIcon className="mr-1.5 size-3.5 animate-spin" /> : null}
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall skill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{skill?.dirName}</code> and all
              its files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </AlertDialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Uninstall
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

// ── Import from GitHub Dialog ───────────────────────────────────────

function ImportGithubDialog({
  open,
  onOpenChange,
  scopeCwd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeCwd: string | undefined;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prevOpenRef = useRef(open);
  if (open && !prevOpenRef.current) {
    setUrl("");
    setError(null);
  }
  prevOpenRef.current = open;

  const importMutation = useMutation({
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.skills.importGithub({ url, cwd: scopeCwd });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || importMutation.isPending) return;
    setError(null);
    importMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Skill from GitHub</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="github-url">Repository URL</Label>
              <Input
                id="github-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/skill-repo"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground/60">
                The repository must contain a SKILL.md file in its root.
              </p>
            </div>
            {error && <p className="text-xs text-destructive-foreground">{error}</p>}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            form={formId}
            type="submit"
            size="sm"
            disabled={!url.trim() || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <GithubIcon className="mr-1.5 size-3.5" />
            )}
            {importMutation.isPending ? "Cloning..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// ── Scope selector ──────────────────────────────────────────────────

type SkillScopeOption = { label: string; value: string; cwd?: string | undefined };

function ScopeSelector({
  options,
  selected,
  onSelect,
}: {
  options: SkillScopeOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const current = options.find((o) => o.value === selected) ?? options[0];

  return (
    <Menu>
      <MenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">
        {selected === "global" ? (
          <GlobeIcon className="size-3.5 text-muted-foreground/60" />
        ) : (
          <BlocksIcon className="size-3.5 text-muted-foreground/60" />
        )}
        {current?.label ?? "Global"}
        <ChevronDownIcon className="size-3 text-muted-foreground/50" />
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" className="min-w-40">
        <MenuRadioGroup value={selected} onValueChange={onSelect}>
          {options.map((opt) => (
            <MenuRadioItem key={opt.value} value={opt.value} className="min-h-7 py-1 sm:text-xs">
              {opt.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

// ── Main Skills Page ────────────────────────────────────────────────

function SkillsRouteView() {
  const queryClient = useQueryClient();
  const projects = useStore((s) => s.projects);

  // Build scope options
  const scopeOptions: SkillScopeOption[] = [
    { label: "Global", value: "global" },
    ...projects.map((p) => ({
      label: p.name,
      value: p.cwd,
      cwd: p.cwd,
    })),
  ];
  const [selectedScope, setSelectedScope] = useState("global");
  const scopeCwd = selectedScope === "global" ? undefined : selectedScope;

  const skillsQuery = useQuery({
    queryKey: [...skillsQueryKeys.list(), selectedScope],
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.skills.list({ cwd: scopeCwd });
    },
  });
  const skills = skillsQuery.data?.skills ?? [];

  const [searchQuery, setSearchQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iconTargetDirName, setIconTargetDirName] = useState<string | null>(null);

  const iconMutation = useMutation({
    mutationFn: async ({ dirName, iconBase64 }: { dirName: string; iconBase64: string }) => {
      const api = ensureNativeApi();
      return api.skills.updateIcon({ dirName, iconBase64, cwd: scopeCwd });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
    },
  });

  const handleIconFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !iconTargetDirName) return;

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const base64 = reader.result as string;
        iconMutation.mutate({ dirName: iconTargetDirName, iconBase64: base64 });
        setIconTargetDirName(null);
      });
      reader.readAsDataURL(file);

      e.target.value = "";
    },
    [iconTargetDirName, iconMutation],
  );

  const handleEdit = useCallback((skill: Skill) => {
    setEditingSkill(skill);
    setEditorOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingSkill(null);
    setEditorOpen(true);
  }, []);

  const filteredSkills = searchQuery.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : skills;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <BlocksIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Skills</span>
            </div>
          </header>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8">
            {/* Title section */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Skills</h1>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Extend Claude and Codex with custom capabilities.
              </p>
            </div>

            {/* Actions bar */}
            <div className="mb-6 flex items-center gap-3">
              <ScopeSelector
                options={scopeOptions}
                selected={selectedScope}
                onSelect={setSelectedScope}
              />
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="text"
                  className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/40 hover:text-foreground"
                    onClick={() => setSearchQuery("")}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <GithubIcon className="mr-1.5 size-3.5" />
                Import
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <PlusIcon className="mr-1.5 size-3.5" />
                New Skill
              </Button>
            </div>

            {/* Skills grid */}
            {skillsQuery.isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoaderIcon className="size-5 animate-spin text-muted-foreground/50" />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted/50">
                  <BlocksIcon className="size-6 text-muted-foreground/40" />
                </div>
                {skills.length === 0 ? (
                  <>
                    <h3 className="text-sm font-medium text-foreground/80">No skills yet</h3>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground/60">
                      Create a custom skill or import one from GitHub to extend your coding agents.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                        <GithubIcon className="mr-1.5 size-3.5" />
                        Import from GitHub
                      </Button>
                      <Button size="sm" onClick={handleCreate}>
                        <PlusIcon className="mr-1.5 size-3.5" />
                        Create Skill
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-medium text-foreground/80">No matching skills</h3>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Try a different search term.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    {selectedScope === "global" ? "Global" : "Project"} ({filteredSkills.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredSkills.map((skill) => (
                    <SkillCard
                      key={skill.dirName}
                      skill={skill}
                      onClick={() => handleEdit(skill)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for icon upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleIconFileChange}
      />

      {/* Dialogs */}
      <SkillEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        skill={editingSkill}
        scopeCwd={scopeCwd}
      />
      <ImportGithubDialog open={importOpen} onOpenChange={setImportOpen} scopeCwd={scopeCwd} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/skills")({
  component: SkillsRouteView,
});
