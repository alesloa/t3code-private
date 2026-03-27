import type { ProjectEntry, ThreadId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  FolderClosedIcon,
  FolderIcon,
  FolderSearchIcon,
  LoaderIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { openInPreferredEditor } from "~/editorPreferences";
import { GENERATE_IMAGE_PREFIX, useFileEditorStore } from "~/fileEditorStore";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useTheme } from "~/hooks/useTheme";
import {
  projectListEntriesQueryOptions,
  projectSearchEntriesQueryOptions,
} from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";
import { ensureNativeApi, readNativeApi } from "~/nativeApi";
import { stripDiffSearchParams } from "~/diffRouteSearch";
import { Sheet, SheetPopup, SheetHeader, SheetTitle } from "../ui/sheet";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Toggle } from "../ui/toggle";
import { VscodeEntryIcon } from "./VscodeEntryIcon";

// ── Touch long-press hook ────────────────────────────────────────────

const LONG_PRESS_MS = 500;

function useLongPress(onLongPress: (position: { x: number; y: number }) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      const touch = e.touches[0];
      if (!touch) return;
      posRef.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress(posRef.current);
      }, LONG_PRESS_MS);
    },
    [onLongPress],
  );

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // If long-press fired, prevent the click that follows
    if (firedRef.current) {
      e.preventDefault();
    }
  }, []);

  const onTouchMove = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { onTouchStart, onTouchEnd, onTouchMove };
}

// ── Context menu helpers ─────────────────────────────────────────────

type ContextMenuAction =
  | "open-in-editor"
  | "copy-path"
  | "copy-relative-path"
  | "copy-name"
  | "new-file"
  | "new-folder"
  | "upload-file"
  | "rename"
  | "duplicate"
  | "delete"
  | "generate-image";

function copyToClipboard(value: string, label: string) {
  if (!navigator.clipboard?.writeText) return;
  void navigator.clipboard.writeText(value).then(
    () => toastManager.add({ type: "success", title: `${label} copied`, description: value }),
    () => toastManager.add({ type: "error", title: `Failed to copy ${label.toLowerCase()}` }),
  );
}

async function showEntryContextMenu(
  cwd: string,
  entry: ProjectEntry,
  position: { x: number; y: number },
  isTouchDevice: boolean,
): Promise<ContextMenuAction | null> {
  const api = readNativeApi();
  if (!api) return null;

  const absolutePath = entry.path === "." ? cwd : `${cwd}/${entry.path}`;
  const isRoot = entry.path === ".";
  const isFile = entry.kind === "file";
  const isDir = entry.kind === "directory";
  const showEditorOption = !isTouchDevice;

  const items = [
    ...(showEditorOption && isFile
      ? [{ id: "open-in-editor" as const, label: "Open in Editor" }]
      : []),
    ...(isDir
      ? [
          { id: "new-file" as const, label: "New File" },
          { id: "new-folder" as const, label: "New Folder" },
          { id: "upload-file" as const, label: "Upload File" },
          { id: "generate-image" as const, label: "Generate Image" },
        ]
      : []),
    ...(isRoot ? [] : [{ id: "rename" as const, label: "Rename" }]),
    ...(isRoot ? [] : [{ id: "duplicate" as const, label: "Duplicate" }]),
    { id: "copy-path" as const, label: "Copy Path" },
    ...(isRoot ? [] : [{ id: "copy-relative-path" as const, label: "Copy Relative Path" }]),
    { id: "copy-name" as const, label: "Copy Name" },
    ...(showEditorOption && isDir
      ? [{ id: "open-in-editor" as const, label: "Open in Editor" }]
      : []),
    ...(isRoot ? [] : [{ id: "delete" as const, label: "Delete" }]),
  ];

  const clicked = await api.contextMenu.show<ContextMenuAction>(items, position);
  if (!clicked) return null;

  // Handle actions that don't need component state
  switch (clicked) {
    case "open-in-editor":
      void openInPreferredEditor(api, absolutePath).catch((error) => {
        toastManager.add({
          type: "error",
          title: "Unable to open in editor",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      });
      return null;
    case "copy-path":
      copyToClipboard(absolutePath, "Path");
      return null;
    case "copy-relative-path":
      copyToClipboard(entry.path, "Relative path");
      return null;
    case "copy-name":
      copyToClipboard(baseName(entry.path), "Name");
      return null;
    default:
      // new-file, new-folder, upload-file — return to caller
      return clicked;
  }
}

async function handleNewFile(cwd: string, parentPath: string): Promise<boolean> {
  const name = window.prompt("Enter file name:");
  if (!name?.trim()) return false;
  const relativePath = parentPath ? `${parentPath}/${name.trim()}` : name.trim();
  try {
    const api = ensureNativeApi();
    await api.projects.writeFile({ cwd, relativePath, contents: "" });
    toastManager.add({ type: "success", title: "File created", description: relativePath });
    return true;
  } catch (err) {
    toastManager.add({
      type: "error",
      title: "Failed to create file",
      description: err instanceof Error ? err.message : "An error occurred.",
    });
    return false;
  }
}

async function handleNewFolder(cwd: string, parentPath: string): Promise<boolean> {
  const name = window.prompt("Enter folder name:");
  if (!name?.trim()) return false;
  // Create a folder by writing a .gitkeep file inside it
  const relativePath = parentPath
    ? `${parentPath}/${name.trim()}/.gitkeep`
    : `${name.trim()}/.gitkeep`;
  try {
    const api = ensureNativeApi();
    await api.projects.writeFile({ cwd, relativePath, contents: "" });
    toastManager.add({
      type: "success",
      title: "Folder created",
      description: parentPath ? `${parentPath}/${name.trim()}` : name.trim(),
    });
    return true;
  } catch (err) {
    toastManager.add({
      type: "error",
      title: "Failed to create folder",
      description: err instanceof Error ? err.message : "An error occurred.",
    });
    return false;
  }
}

function triggerFileUpload(cwd: string, parentPath: string, onDone: () => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", async () => {
    const files = input.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
      try {
        const api = ensureNativeApi();
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);
        await api.projects.writeFileBase64({ cwd, relativePath, base64 });
        toastManager.add({ type: "success", title: "File uploaded", description: file.name });
      } catch (err) {
        toastManager.add({
          type: "error",
          title: `Failed to upload ${file.name}`,
          description: err instanceof Error ? err.message : "An error occurred.",
        });
      }
    }
    onDone();
  });
  input.click();
}

async function handleRenameEntry(cwd: string, relativePath: string): Promise<boolean> {
  const currentName = baseName(relativePath);
  const newName = window.prompt("Enter new name:", currentName);
  if (!newName?.trim() || newName.trim() === currentName) return false;
  const parentDir = relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/"))
    : "";
  const newRelativePath = parentDir ? `${parentDir}/${newName.trim()}` : newName.trim();
  try {
    const api = ensureNativeApi();
    await api.projects.renameFile({ cwd, relativePath, newRelativePath });
    toastManager.add({ type: "success", title: "Renamed", description: newRelativePath });
    return true;
  } catch (err) {
    toastManager.add({
      type: "error",
      title: "Failed to rename",
      description: err instanceof Error ? err.message : "An error occurred.",
    });
    return false;
  }
}

async function handleDuplicateEntry(cwd: string, relativePath: string): Promise<boolean> {
  const ext = relativePath.includes(".") ? relativePath.slice(relativePath.lastIndexOf(".")) : "";
  const nameWithoutExt = ext ? relativePath.slice(0, relativePath.lastIndexOf(".")) : relativePath;
  const newRelativePath = `${nameWithoutExt} copy${ext}`;
  try {
    const api = ensureNativeApi();
    // Read original and write copy
    const original = await api.projects.readFileBase64({ cwd, relativePath });
    await api.projects.writeFileBase64({
      cwd,
      relativePath: newRelativePath,
      base64: original.base64,
    });
    toastManager.add({
      type: "success",
      title: "Duplicated",
      description: baseName(newRelativePath),
    });
    return true;
  } catch (err) {
    toastManager.add({
      type: "error",
      title: "Failed to duplicate",
      description: err instanceof Error ? err.message : "An error occurred.",
    });
    return false;
  }
}

async function handleDeleteEntry(cwd: string, relativePath: string): Promise<boolean> {
  const confirmed = window.confirm(`Delete "${baseName(relativePath)}"?\n\nThis cannot be undone.`);
  if (!confirmed) return false;
  try {
    const api = ensureNativeApi();
    await api.projects.deleteFile({ cwd, relativePath });
    toastManager.add({ type: "success", title: "Deleted", description: relativePath });
    return true;
  } catch (err) {
    toastManager.add({
      type: "error",
      title: "Failed to delete",
      description: err instanceof Error ? err.message : "An error occurred.",
    });
    return false;
  }
}

// ── Directory Node (lazy-loaded children) ────────────────────────────

const DirectoryNode = memo(function DirectoryNode(props: {
  entry: ProjectEntry;
  cwd: string;
  depth: number;
  resolvedTheme: "light" | "dark";
  isTouchDevice: boolean;
  expandedDirectories: Record<string, boolean>;
  onToggleDirectory: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onRefreshTree: () => void;
}) {
  const {
    entry,
    cwd,
    depth,
    resolvedTheme,
    isTouchDevice,
    expandedDirectories,
    onToggleDirectory,
    onOpenFile,
    onRefreshTree,
  } = props;
  const isExpanded = expandedDirectories[entry.path] ?? false;
  const leftPadding = 12 + depth * 16;

  const { data, isLoading } = useQuery(
    projectListEntriesQueryOptions({
      cwd,
      parentPath: entry.path,
      enabled: isExpanded,
    }),
  );

  const triggerContextMenu = useCallback(
    (position: { x: number; y: number }) => {
      void showEntryContextMenu(cwd, entry, position, isTouchDevice).then(async (action) => {
        if (!action) return;
        let changed = false;
        switch (action) {
          case "new-file":
            changed = await handleNewFile(cwd, entry.path);
            break;
          case "new-folder":
            changed = await handleNewFolder(cwd, entry.path);
            break;
          case "upload-file":
            triggerFileUpload(cwd, entry.path, onRefreshTree);
            return;
          case "generate-image":
            onOpenFile(`${GENERATE_IMAGE_PREFIX}${entry.path}`);
            return;
          case "rename":
            changed = await handleRenameEntry(cwd, entry.path);
            break;
          case "duplicate":
            changed = await handleDuplicateEntry(cwd, entry.path);
            break;
          case "delete":
            changed = await handleDeleteEntry(cwd, entry.path);
            break;
        }
        if (changed) onRefreshTree();
      });
    },
    [cwd, entry, isTouchDevice, onRefreshTree, onOpenFile],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      triggerContextMenu({ x: e.clientX, y: e.clientY });
    },
    [triggerContextMenu],
  );

  const longPress = useLongPress(triggerContextMenu);

  return (
    <div>
      <button
        type="button"
        className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left hover:bg-accent/50"
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => onToggleDirectory(entry.path)}
        onContextMenu={handleContextMenu}
        {...longPress}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
            isExpanded && "rotate-90",
          )}
        />
        {isExpanded ? (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        ) : (
          <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        )}
        <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
          {baseName(entry.path)}
        </span>
      </button>
      {isExpanded && (
        <div>
          {isLoading && (
            <div
              className="flex items-center gap-1.5 py-1.5 text-muted-foreground/60"
              style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
            >
              <LoaderIcon className="size-3 animate-spin" />
              <span className="font-mono text-[10px]">Loading...</span>
            </div>
          )}
          {data?.entries.map((childEntry) =>
            childEntry.kind === "directory" ? (
              <DirectoryNode
                key={childEntry.path}
                entry={childEntry}
                cwd={cwd}
                depth={depth + 1}
                resolvedTheme={resolvedTheme}
                isTouchDevice={isTouchDevice}
                expandedDirectories={expandedDirectories}
                onToggleDirectory={onToggleDirectory}
                onOpenFile={onOpenFile}
                onRefreshTree={onRefreshTree}
              />
            ) : (
              <FileNode
                key={childEntry.path}
                entry={childEntry}
                cwd={cwd}
                depth={depth + 1}
                resolvedTheme={resolvedTheme}
                isTouchDevice={isTouchDevice}
                onOpenFile={onOpenFile}
                onRefreshTree={onRefreshTree}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
});

// ── File Node ────────────────────────────────────────────────────────

const FileNode = memo(function FileNode(props: {
  entry: ProjectEntry;
  cwd: string;
  depth: number;
  resolvedTheme: "light" | "dark";
  isTouchDevice: boolean;
  onOpenFile: (relativePath: string) => void;
  onRefreshTree: () => void;
}) {
  const { entry, cwd, depth, resolvedTheme, isTouchDevice, onOpenFile, onRefreshTree } = props;
  const leftPadding = 12 + depth * 16;

  const triggerContextMenu = useCallback(
    (position: { x: number; y: number }) => {
      void showEntryContextMenu(cwd, entry, position, isTouchDevice).then(async (action) => {
        if (!action) return;
        let changed = false;
        switch (action) {
          case "rename":
            changed = await handleRenameEntry(cwd, entry.path);
            break;
          case "duplicate":
            changed = await handleDuplicateEntry(cwd, entry.path);
            break;
          case "delete":
            changed = await handleDeleteEntry(cwd, entry.path);
            break;
        }
        if (changed) onRefreshTree();
      });
    },
    [cwd, entry, isTouchDevice, onRefreshTree],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      triggerContextMenu({ x: e.clientX, y: e.clientY });
    },
    [triggerContextMenu],
  );

  const longPress = useLongPress(triggerContextMenu);

  return (
    <button
      type="button"
      className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left hover:bg-accent/50"
      style={{ paddingLeft: `${leftPadding}px` }}
      onClick={() => onOpenFile(entry.path)}
      onContextMenu={handleContextMenu}
      {...longPress}
    >
      <span aria-hidden="true" className="size-3.5 shrink-0" />
      <VscodeEntryIcon
        pathValue={entry.path}
        kind="file"
        theme={resolvedTheme}
        className="size-3.5 text-muted-foreground/70"
      />
      <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
        {baseName(entry.path)}
      </span>
    </button>
  );
});

// ── Search Results Tree ───────────────────────────────────────────────

interface SearchTreeNode {
  name: string;
  fullPath: string;
  entry: ProjectEntry | null; // null for intermediate directories
  children: SearchTreeNode[];
}

function sortSearchTreeChildren(nodes: SearchTreeNode[]) {
  nodes.sort((a, b) => {
    const aIsDir = a.entry === null || a.entry.kind === "directory";
    const bIsDir = b.entry === null || b.entry.kind === "directory";
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) sortSearchTreeChildren(node.children);
  }
}

function buildSearchTree(entries: readonly ProjectEntry[]): SearchTreeNode[] {
  const root: SearchTreeNode[] = [];
  const dirMap = new Map<string, SearchTreeNode>();

  function ensureDir(dirPath: string): SearchTreeNode {
    const existing = dirMap.get(dirPath);
    if (existing) return existing;

    const parts = dirPath.split("/");
    const name = parts[parts.length - 1] ?? dirPath;
    const node: SearchTreeNode = { name, fullPath: dirPath, entry: null, children: [] };
    dirMap.set(dirPath, node);

    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureDir(parentPath);
      parent.children.push(node);
    } else {
      root.push(node);
    }

    return node;
  }

  for (const entry of entries) {
    const name = baseName(entry.path);
    const leaf: SearchTreeNode = { name, fullPath: entry.path, entry, children: [] };

    if (entry.parentPath) {
      const parent = ensureDir(entry.parentPath);
      parent.children.push(leaf);
    } else {
      root.push(leaf);
    }
  }

  sortSearchTreeChildren(root);
  return root;
}

const SearchTreeDirNode = memo(function SearchTreeDirNode(props: {
  node: SearchTreeNode;
  cwd: string;
  depth: number;
  resolvedTheme: "light" | "dark";
  isTouchDevice: boolean;
  onOpenFile: (relativePath: string) => void;
  onRefreshTree: () => void;
}) {
  const { node, cwd, depth, resolvedTheme, isTouchDevice, onOpenFile, onRefreshTree } = props;
  const [expanded, setExpanded] = useState(true);
  const leftPadding = 12 + depth * 16;

  const dirEntry = useMemo<ProjectEntry>(
    () =>
      node.entry ?? {
        path: node.fullPath,
        kind: "directory" as const,
        parentPath: node.fullPath.includes("/")
          ? node.fullPath.slice(0, node.fullPath.lastIndexOf("/"))
          : undefined,
      },
    [node.entry, node.fullPath],
  );

  const triggerContextMenu = useCallback(
    (position: { x: number; y: number }) => {
      void showEntryContextMenu(cwd, dirEntry, position, isTouchDevice).then(async (action) => {
        if (!action) return;
        let changed = false;
        switch (action) {
          case "new-file":
            changed = await handleNewFile(cwd, dirEntry.path);
            break;
          case "new-folder":
            changed = await handleNewFolder(cwd, dirEntry.path);
            break;
          case "upload-file":
            triggerFileUpload(cwd, dirEntry.path, onRefreshTree);
            return;
          case "generate-image":
            onOpenFile(`${GENERATE_IMAGE_PREFIX}${dirEntry.path}`);
            return;
          case "rename":
            changed = await handleRenameEntry(cwd, dirEntry.path);
            break;
          case "duplicate":
            changed = await handleDuplicateEntry(cwd, dirEntry.path);
            break;
          case "delete":
            changed = await handleDeleteEntry(cwd, dirEntry.path);
            break;
        }
        if (changed) onRefreshTree();
      });
    },
    [cwd, dirEntry, isTouchDevice, onRefreshTree, onOpenFile],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      triggerContextMenu({ x: e.clientX, y: e.clientY });
    },
    [triggerContextMenu],
  );

  const longPress = useLongPress(triggerContextMenu);

  return (
    <div>
      <button
        type="button"
        className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left hover:bg-accent/50"
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => setExpanded((e) => !e)}
        onContextMenu={handleContextMenu}
        {...longPress}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
            expanded && "rotate-90",
          )}
        />
        {expanded ? (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        ) : (
          <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        )}
        <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
          {node.name}
        </span>
      </button>
      {expanded && (
        <div>
          {node.children.map((child) =>
            child.children.length > 0 || (child.entry && child.entry.kind === "directory") ? (
              <SearchTreeDirNode
                key={child.fullPath}
                node={child}
                cwd={cwd}
                depth={depth + 1}
                resolvedTheme={resolvedTheme}
                isTouchDevice={isTouchDevice}
                onOpenFile={onOpenFile}
                onRefreshTree={onRefreshTree}
              />
            ) : child.entry ? (
              <SearchTreeFileNode
                key={child.fullPath}
                node={child}
                cwd={cwd}
                depth={depth + 1}
                resolvedTheme={resolvedTheme}
                isTouchDevice={isTouchDevice}
                onOpenFile={onOpenFile}
                onRefreshTree={onRefreshTree}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
});

const SearchTreeFileNode = memo(function SearchTreeFileNode(props: {
  node: SearchTreeNode;
  cwd: string;
  depth: number;
  resolvedTheme: "light" | "dark";
  isTouchDevice: boolean;
  onOpenFile: (relativePath: string) => void;
  onRefreshTree: () => void;
}) {
  const { node, cwd, depth, resolvedTheme, isTouchDevice, onOpenFile, onRefreshTree } = props;
  const leftPadding = 12 + depth * 16;

  const triggerContextMenu = useCallback(
    (position: { x: number; y: number }) => {
      if (!node.entry) return;
      void showEntryContextMenu(cwd, node.entry, position, isTouchDevice).then(async (action) => {
        if (!action) return;
        let changed = false;
        switch (action) {
          case "rename":
            changed = await handleRenameEntry(cwd, node.fullPath);
            break;
          case "duplicate":
            changed = await handleDuplicateEntry(cwd, node.fullPath);
            break;
          case "delete":
            changed = await handleDeleteEntry(cwd, node.fullPath);
            break;
        }
        if (changed) onRefreshTree();
      });
    },
    [cwd, node.entry, node.fullPath, isTouchDevice, onRefreshTree],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      triggerContextMenu({ x: e.clientX, y: e.clientY });
    },
    [triggerContextMenu],
  );

  const longPress = useLongPress(triggerContextMenu);

  return (
    <button
      type="button"
      className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left hover:bg-accent/50"
      style={{ paddingLeft: `${leftPadding}px` }}
      onClick={() => onOpenFile(node.fullPath)}
      onContextMenu={handleContextMenu}
      {...longPress}
    >
      <span aria-hidden="true" className="size-3.5 shrink-0" />
      <VscodeEntryIcon
        pathValue={node.fullPath}
        kind="file"
        theme={resolvedTheme}
        className="size-3.5 text-muted-foreground/70"
      />
      <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
        {node.name}
      </span>
    </button>
  );
});

const SearchResultsTree = memo(function SearchResultsTree(props: {
  entries: readonly ProjectEntry[];
  cwd: string;
  resolvedTheme: "light" | "dark";
  isTouchDevice: boolean;
  onOpenFile: (relativePath: string) => void;
  onRefreshTree: () => void;
}) {
  const { entries, cwd, resolvedTheme, isTouchDevice, onOpenFile, onRefreshTree } = props;
  const tree = useMemo(() => buildSearchTree(entries), [entries]);

  return (
    <div>
      {tree.map((node) =>
        node.children.length > 0 || (node.entry && node.entry.kind === "directory") ? (
          <SearchTreeDirNode
            key={node.fullPath}
            node={node}
            cwd={cwd}
            depth={0}
            resolvedTheme={resolvedTheme}
            isTouchDevice={isTouchDevice}
            onOpenFile={onOpenFile}
            onRefreshTree={onRefreshTree}
          />
        ) : node.entry ? (
          <SearchTreeFileNode
            key={node.fullPath}
            node={node}
            cwd={cwd}
            depth={0}
            resolvedTheme={resolvedTheme}
            isTouchDevice={isTouchDevice}
            onOpenFile={onOpenFile}
            onRefreshTree={onRefreshTree}
          />
        ) : null,
      )}
    </div>
  );
});

// ── File Browser Panel ───────────────────────────────────────────────

export const FileBrowserPanel = memo(function FileBrowserPanel(props: {
  cwd: string | null;
  threadId: ThreadId;
}) {
  const { cwd, threadId } = props;
  const { resolvedTheme } = useTheme();
  const isTouchDevice = useMediaQuery({ pointer: "coarse" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openFileInEditor = useFileEditorStore((s) => s.openFile);
  const [open, setOpen] = useState(false);
  const [activeCwd, setActiveCwd] = useState<string | null>(cwd);
  const [pathInputValue, setPathInputValue] = useState(cwd ?? "");
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const pathInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchActive = searchQuery.length > 0;

  // Sync activeCwd when the project's cwd prop changes (e.g. switching projects)
  useEffect(() => {
    setActiveCwd(cwd);
    setPathInputValue(cwd ?? "");
    setExpandedDirectories({});
    setSearchInputValue("");
    setSearchQuery("");
  }, [cwd]);

  const { data, isLoading } = useQuery(
    projectListEntriesQueryOptions({
      cwd: activeCwd,
      enabled: open && !isSearchActive,
    }),
  );

  const { data: searchData, isLoading: searchLoading } = useQuery(
    projectSearchEntriesQueryOptions({
      cwd: activeCwd,
      query: searchQuery,
      enabled: open && isSearchActive,
    }),
  );

  const onToggleDirectory = useCallback((path: string) => {
    setExpandedDirectories((current) => ({
      ...current,
      [path]: !current[path],
    }));
  }, []);

  const onOpenFile = useCallback(
    (relativePath: string) => {
      if (!activeCwd) return;
      // Open file in the editor panel
      openFileInEditor(threadId, activeCwd, relativePath);
      // Close the file browser sheet
      setOpen(false);
      // Strip diff param to close diff panel (mutual exclusion)
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return { ...rest, diff: undefined };
        },
      });
    },
    [activeCwd, threadId, openFileInEditor, navigate],
  );

  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInputValue.trim();
    if (!trimmed) return;
    const normalized = trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
    setActiveCwd(normalized);
    setPathInputValue(normalized);
    setExpandedDirectories({});
  }, [pathInputValue]);

  const handlePathKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handlePathSubmit();
      }
    },
    [handlePathSubmit],
  );

  const handleSearchSubmit = useCallback(() => {
    setSearchQuery(searchInputValue.trim());
  }, [searchInputValue]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchSubmit();
      }
      if (e.key === "Escape") {
        setSearchInputValue("");
        setSearchQuery("");
      }
    },
    [handleSearchSubmit],
  );

  const clearSearch = useCallback(() => {
    setSearchInputValue("");
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  const onRefreshTree = useCallback(() => {
    if (!activeCwd) return;
    // Invalidate all list-entries and search-entries queries for this cwd
    void queryClient.invalidateQueries({
      queryKey: ["projects", "list-entries", activeCwd],
    });
    void queryClient.invalidateQueries({
      queryKey: ["projects", "search-entries", activeCwd],
    });
  }, [activeCwd, queryClient]);

  const handleRootContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!activeCwd) return;
      e.preventDefault();
      const rootEntry: ProjectEntry = {
        path: ".",
        kind: "directory" as const,
      };
      void showEntryContextMenu(
        activeCwd,
        rootEntry,
        { x: e.clientX, y: e.clientY },
        isTouchDevice,
      ).then(async (action) => {
        if (!action) return;
        let changed = false;
        switch (action) {
          case "new-file":
            changed = await handleNewFile(activeCwd, "");
            break;
          case "new-folder":
            changed = await handleNewFolder(activeCwd, "");
            break;
          case "upload-file":
            triggerFileUpload(activeCwd, "", onRefreshTree);
            return;
          case "rename":
            changed = await handleRenameEntry(activeCwd, ".");
            break;
          case "delete":
            changed = await handleDeleteEntry(activeCwd, ".");
            break;
        }
        if (changed) onRefreshTree();
      });
    },
    [activeCwd, isTouchDevice, onRefreshTree],
  );

  const rootLongPress = useLongPress(
    useCallback(
      (position: { x: number; y: number }) => {
        if (!activeCwd) return;
        const rootEntry: ProjectEntry = {
          path: ".",
          kind: "directory" as const,
        };
        void showEntryContextMenu(activeCwd, rootEntry, position, isTouchDevice).then(
          async (action) => {
            if (!action) return;
            let changed = false;
            switch (action) {
              case "new-file":
                changed = await handleNewFile(activeCwd, "");
                break;
              case "new-folder":
                changed = await handleNewFolder(activeCwd, "");
                break;
              case "upload-file":
                triggerFileUpload(activeCwd, "", onRefreshTree);
                return;
            }
            if (changed) onRefreshTree();
          },
        );
      },
      [activeCwd, isTouchDevice, onRefreshTree],
    ),
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0"
              pressed={open}
              onPressedChange={setOpen}
              aria-label="Toggle file browser"
              variant="outline"
              size="xs"
              disabled={!cwd}
            >
              <FolderSearchIcon className="size-3" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {!cwd
            ? "File browser is unavailable until this thread has an active project."
            : "Browse project files"}
        </TooltipPopup>
      </Tooltip>
      <Sheet
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(false);
        }}
      >
        <SheetPopup side="right" showCloseButton className="w-[min(88vw,520px)] max-w-[520px] p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Files</SheetTitle>
          </SheetHeader>
          <div className="space-y-1.5 border-b px-3 py-2">
            <input
              ref={pathInputRef}
              type="text"
              value={pathInputValue}
              onChange={(e) => setPathInputValue(e.target.value)}
              onKeyDown={handlePathKeyDown}
              onBlur={handlePathSubmit}
              placeholder="/path/to/directory"
              spellCheck={false}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground/90 shadow-xs/5 outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
            />
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search files..."
                spellCheck={false}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-7 font-mono text-[11px] text-foreground/90 shadow-xs/5 outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
              />
              {isSearchActive && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-foreground/80"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {/* Root folder row */}
            {activeCwd && !isSearchActive && (
              <button
                type="button"
                className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pl-3 pr-2 text-left hover:bg-accent/50"
                onContextMenu={handleRootContextMenu}
                {...rootLongPress}
              >
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
                <span className="truncate font-mono text-[11px] font-medium text-foreground/80 group-hover:text-foreground/90">
                  {baseName(activeCwd) || activeCwd}
                </span>
              </button>
            )}
            {isSearchActive ? (
              <>
                {searchLoading && (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground/60">
                    <LoaderIcon className="size-4 animate-spin" />
                    <span className="text-xs">Searching...</span>
                  </div>
                )}
                {!searchLoading && searchData?.entries.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground/60">
                    No matches found
                  </div>
                )}
                {searchData && searchData.entries.length > 0 && (
                  <SearchResultsTree
                    entries={searchData.entries}
                    cwd={activeCwd!}
                    resolvedTheme={resolvedTheme}
                    isTouchDevice={isTouchDevice}
                    onOpenFile={onOpenFile}
                    onRefreshTree={onRefreshTree}
                  />
                )}
                {searchData?.truncated && (
                  <div className="border-t px-3 py-2 text-center text-[10px] text-muted-foreground/60">
                    Results truncated — try a more specific query.
                  </div>
                )}
              </>
            ) : (
              <>
                {isLoading && (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground/60">
                    <LoaderIcon className="size-4 animate-spin" />
                    <span className="text-xs">Scanning workspace...</span>
                  </div>
                )}
                {!isLoading && data?.entries.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground/60">
                    No files found
                  </div>
                )}
                {data && data.entries.length > 0 && (
                  <div>
                    {data.entries.map((entry) =>
                      entry.kind === "directory" ? (
                        <DirectoryNode
                          key={entry.path}
                          entry={entry}
                          cwd={activeCwd!}
                          depth={0}
                          resolvedTheme={resolvedTheme}
                          isTouchDevice={isTouchDevice}
                          expandedDirectories={expandedDirectories}
                          onToggleDirectory={onToggleDirectory}
                          onOpenFile={onOpenFile}
                          onRefreshTree={onRefreshTree}
                        />
                      ) : (
                        <FileNode
                          key={entry.path}
                          entry={entry}
                          cwd={activeCwd!}
                          depth={0}
                          resolvedTheme={resolvedTheme}
                          isTouchDevice={isTouchDevice}
                          onOpenFile={onOpenFile}
                          onRefreshTree={onRefreshTree}
                        />
                      ),
                    )}
                  </div>
                )}
                {data?.truncated && (
                  <div className="border-t px-3 py-2 text-center text-[10px] text-muted-foreground/60">
                    Some entries are hidden due to workspace size limits.
                  </div>
                )}
              </>
            )}
          </div>
        </SheetPopup>
      </Sheet>
    </>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────

function baseName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}
