import type {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitDeleteBranchInput,
  GitListPullRequestsInput,
  GitListPullRequestsResult,
  GitListWorktreesInput,
  GitLogInput,
  GitLogResult,
  GitListWorktreesResult,
  GitStageFilesInput,
  GitStashApplyInput,
  GitStashCreateInput,
  GitStashDropInput,
  GitStashListInput,
  GitStashListResult,
  GitStashPopInput,
  GitStashShowInput,
  GitStashShowResult,
  GitStashShowFileInput,
  GitStashShowFileResult,
  GitStashShowFilesResult,
  GitStashRestoreFileInput,
  GitGenerateCommitMessageInput,
  GitGenerateCommitMessageResult,
  GitStatusDetailedInput,
  GitStatusDetailedResult,
  GitStatusInput,
  GitStatusResult,
  GitUnstageFilesInput,
} from "./git";
import type {
  ProjectListEntriesInput,
  ProjectDeleteFileInput,
  ProjectDeleteFileResult,
  ProjectListEntriesResult,
  ProjectReadFileBase64Result,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectRenameFileInput,
  ProjectRenameFileResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileBase64Input,
  ProjectWriteFileBase64Result,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import type {
  ServerConfig,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingResult,
} from "./server";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import type { ServerUpsertKeybindingInput } from "./server";
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "./orchestration";
import { EditorId } from "./editor";
import { ServerSettings, ServerSettingsPatch } from "./settings";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  destructive?: boolean;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface DesktopBridge {
  getWsUrl: () => string | null;
  pickFolder: () => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}

export interface NativeApi {
  dialogs: {
    pickFolder: () => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  terminal: {
    open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    clear: (input: TerminalClearInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<TerminalSessionSnapshot>;
    close: (input: TerminalCloseInput) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    listEntries: (input: ProjectListEntriesInput) => Promise<ProjectListEntriesResult>;
    readFile: (input: ProjectReadFileInput) => Promise<ProjectReadFileResult>;
    readFileBase64: (input: ProjectReadFileInput) => Promise<ProjectReadFileBase64Result>;
    renameFile: (input: ProjectRenameFileInput) => Promise<ProjectRenameFileResult>;
    deleteFile: (input: ProjectDeleteFileInput) => Promise<ProjectDeleteFileResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
    writeFileBase64: (input: ProjectWriteFileBase64Input) => Promise<ProjectWriteFileBase64Result>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  git: {
    // Existing branch/worktree API
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    checkout: (input: GitCheckoutInput) => Promise<void>;
    init: (input: GitInitInput) => Promise<void>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    // Detailed status + staging API
    statusDetailed: (input: GitStatusDetailedInput) => Promise<GitStatusDetailedResult>;
    stageFiles: (input: GitStageFilesInput) => Promise<void>;
    unstageFiles: (input: GitUnstageFilesInput) => Promise<void>;
    deleteBranch: (input: GitDeleteBranchInput) => Promise<void>;
    // Stash API
    stashList: (input: GitStashListInput) => Promise<GitStashListResult>;
    stashCreate: (input: GitStashCreateInput) => Promise<void>;
    stashApply: (input: GitStashApplyInput) => Promise<void>;
    stashPop: (input: GitStashPopInput) => Promise<void>;
    stashDrop: (input: GitStashDropInput) => Promise<void>;
    stashShow: (input: GitStashShowInput) => Promise<GitStashShowResult>;
    stashShowFiles: (input: GitStashShowInput) => Promise<GitStashShowFilesResult>;
    stashShowFile: (input: GitStashShowFileInput) => Promise<GitStashShowFileResult>;
    stashRestoreFile: (input: GitStashRestoreFileInput) => Promise<void>;
    // Generate commit message API
    generateCommitMessage: (
      input: GitGenerateCommitMessageInput,
    ) => Promise<GitGenerateCommitMessageResult>;
    // Worktree + PR list API
    listWorktrees: (input: GitListWorktreesInput) => Promise<GitListWorktreesResult>;
    listPullRequests: (input: GitListPullRequestsInput) => Promise<GitListPullRequestsResult>;
    // Log API
    log: (input: GitLogInput) => Promise<GitLogResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    onActionProgress: (callback: (event: GitActionProgressEvent) => void) => () => void;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    refreshProviders: () => Promise<ServerProviderUpdatedPayload>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
    getSettings: () => Promise<ServerSettings>;
    updateSettings: (patch: ServerSettingsPatch) => Promise<ServerSettings>;
  };
  orchestration: {
    getSnapshot: () => Promise<OrchestrationReadModel>;
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
  };
}
