import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;

// Domain Types

export const GitStackedAction = Schema.Literals(["commit", "commit_push", "commit_push_pr"]);
export type GitStackedAction = typeof GitStackedAction.Type;
export const GitActionProgressPhase = Schema.Literals(["branch", "commit", "push", "pr"]);
export type GitActionProgressPhase = typeof GitActionProgressPhase.Type;
export const GitActionProgressKind = Schema.Literals([
  "action_started",
  "phase_started",
  "hook_started",
  "hook_output",
  "hook_finished",
  "action_finished",
  "action_failed",
]);
export type GitActionProgressKind = typeof GitActionProgressKind.Type;
export const GitActionProgressStream = Schema.Literals(["stdout", "stderr"]);
export type GitActionProgressStream = typeof GitActionProgressStream.Type;
const GitCommitStepStatus = Schema.Literals(["created", "skipped_no_changes"]);
const GitPushStepStatus = Schema.Literals([
  "pushed",
  "skipped_not_requested",
  "skipped_up_to_date",
]);
const GitBranchStepStatus = Schema.Literals(["created", "skipped_not_requested"]);
const GitPrStepStatus = Schema.Literals(["created", "opened_existing", "skipped_not_requested"]);
const GitStatusPrState = Schema.Literals(["open", "closed", "merged"]);
const GitPullRequestReference = TrimmedNonEmptyStringSchema;
const GitPullRequestState = Schema.Literals(["open", "closed", "merged"]);
const GitPreparePullRequestThreadMode = Schema.Literals(["local", "worktree"]);

export const GitBranch = Schema.Struct({
  name: TrimmedNonEmptyStringSchema,
  isRemote: Schema.optional(Schema.Boolean),
  remoteName: Schema.optional(TrimmedNonEmptyStringSchema),
  current: Schema.Boolean,
  isDefault: Schema.Boolean,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitBranch = typeof GitBranch.Type;

const GitWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
const GitResolvedPullRequest = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitPullRequestState,
});
export type GitResolvedPullRequest = typeof GitResolvedPullRequest.Type;

// RPC Inputs

export const GitStatusInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStatusInput = typeof GitStatusInput.Type;

export const GitPullInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitPullInput = typeof GitPullInput.Type;

export const GitRunStackedActionInput = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
  commitMessage: Schema.optional(TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(10_000))),
  featureBranch: Schema.optional(Schema.Boolean),
  filePaths: Schema.optional(
    Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
  ),
});
export type GitRunStackedActionInput = typeof GitRunStackedActionInput.Type;

export const GitListBranchesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitListBranchesInput = typeof GitListBranchesInput.Type;

export const GitCreateWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  newBranch: Schema.optional(TrimmedNonEmptyStringSchema),
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateWorktreeInput = typeof GitCreateWorktreeInput.Type;

export const GitPullRequestRefInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
});
export type GitPullRequestRefInput = typeof GitPullRequestRefInput.Type;

export const GitPreparePullRequestThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
  mode: GitPreparePullRequestThreadMode,
});
export type GitPreparePullRequestThreadInput = typeof GitPreparePullRequestThreadInput.Type;

export const GitRemoveWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  path: TrimmedNonEmptyStringSchema,
  force: Schema.optional(Schema.Boolean),
});
export type GitRemoveWorktreeInput = typeof GitRemoveWorktreeInput.Type;

export const GitCreateBranchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitCreateBranchInput = typeof GitCreateBranchInput.Type;

export const GitCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitCheckoutInput = typeof GitCheckoutInput.Type;

export const GitInitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitInitInput = typeof GitInitInput.Type;

// RPC Results

const GitStatusPr = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitStatusPrState,
});

export const GitStatusResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: Schema.Struct({
    files: Schema.Array(
      Schema.Struct({
        path: TrimmedNonEmptyStringSchema,
        insertions: NonNegativeInt,
        deletions: NonNegativeInt,
      }),
    ),
    insertions: NonNegativeInt,
    deletions: NonNegativeInt,
  }),
  hasUpstream: Schema.Boolean,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusResult = typeof GitStatusResult.Type;

export const GitListBranchesResult = Schema.Struct({
  branches: Schema.Array(GitBranch),
  isRepo: Schema.Boolean,
  hasOriginRemote: Schema.Boolean,
});
export type GitListBranchesResult = typeof GitListBranchesResult.Type;

export const GitCreateWorktreeResult = Schema.Struct({
  worktree: GitWorktree,
});
export type GitCreateWorktreeResult = typeof GitCreateWorktreeResult.Type;

export const GitResolvePullRequestResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
});
export type GitResolvePullRequestResult = typeof GitResolvePullRequestResult.Type;

export const GitPreparePullRequestThreadResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
  branch: TrimmedNonEmptyStringSchema,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPreparePullRequestThreadResult = typeof GitPreparePullRequestThreadResult.Type;

export const GitRunStackedActionResult = Schema.Struct({
  action: GitStackedAction,
  branch: Schema.Struct({
    status: GitBranchStepStatus,
    name: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  commit: Schema.Struct({
    status: GitCommitStepStatus,
    commitSha: Schema.optional(TrimmedNonEmptyStringSchema),
    subject: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  push: Schema.Struct({
    status: GitPushStepStatus,
    branch: Schema.optional(TrimmedNonEmptyStringSchema),
    upstreamBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    setUpstream: Schema.optional(Schema.Boolean),
  }),
  pr: Schema.Struct({
    status: GitPrStepStatus,
    url: Schema.optional(Schema.String),
    number: Schema.optional(PositiveInt),
    baseBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    headBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    title: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
});
export type GitRunStackedActionResult = typeof GitRunStackedActionResult.Type;

export const GitPullResult = Schema.Struct({
  status: Schema.Literals(["pulled", "skipped_up_to_date"]),
  branch: TrimmedNonEmptyStringSchema,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPullResult = typeof GitPullResult.Type;

const GitActionProgressBase = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
});

const GitActionStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_started"),
  phases: Schema.Array(GitActionProgressPhase),
});
const GitActionPhaseStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("phase_started"),
  phase: GitActionProgressPhase,
  label: TrimmedNonEmptyStringSchema,
});
const GitActionHookStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_started"),
  hookName: TrimmedNonEmptyStringSchema,
});
const GitActionHookOutputEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_output"),
  hookName: Schema.NullOr(TrimmedNonEmptyStringSchema),
  stream: GitActionProgressStream,
  text: TrimmedNonEmptyStringSchema,
});
const GitActionHookFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_finished"),
  hookName: TrimmedNonEmptyStringSchema,
  exitCode: Schema.NullOr(Schema.Int),
  durationMs: Schema.NullOr(NonNegativeInt),
});
const GitActionFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_finished"),
  result: GitRunStackedActionResult,
});
const GitActionFailedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_failed"),
  phase: Schema.NullOr(GitActionProgressPhase),
  message: TrimmedNonEmptyStringSchema,
});

export const GitActionProgressEvent = Schema.Union([
  GitActionStartedEvent,
  GitActionPhaseStartedEvent,
  GitActionHookStartedEvent,
  GitActionHookOutputEvent,
  GitActionHookFinishedEvent,
  GitActionFinishedEvent,
  GitActionFailedEvent,
]);
export type GitActionProgressEvent = typeof GitActionProgressEvent.Type;

// ── Detailed Status (staged / unstaged separation) ────────────────────

export const GitFileStatus = Schema.Literals([
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "typechange",
  "unmerged",
]);
export type GitFileStatus = typeof GitFileStatus.Type;

export const GitStatusDetailedFile = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  status: GitFileStatus,
  insertions: NonNegativeInt,
  deletions: NonNegativeInt,
  oldPath: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type GitStatusDetailedFile = typeof GitStatusDetailedFile.Type;

export const GitStatusDetailedInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStatusDetailedInput = typeof GitStatusDetailedInput.Type;

export const GitStatusDetailedResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  staged: Schema.Array(GitStatusDetailedFile),
  unstaged: Schema.Array(GitStatusDetailedFile),
  untracked: Schema.Array(Schema.Struct({ path: TrimmedNonEmptyStringSchema })),
  hasUpstream: Schema.Boolean,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusDetailedResult = typeof GitStatusDetailedResult.Type;

// ── Stage / Unstage Files ─────────────────────────────────────────────

export const GitStageFilesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  filePaths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitStageFilesInput = typeof GitStageFilesInput.Type;

export const GitUnstageFilesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  filePaths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitUnstageFilesInput = typeof GitUnstageFilesInput.Type;

// ── Discard Changes ───────────────────────────────────────────────────

export const GitDiscardChangesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  filePaths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitDiscardChangesInput = typeof GitDiscardChangesInput.Type;

// ── Delete Branch ─────────────────────────────────────────────────────

export const GitDeleteBranchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  force: Schema.optional(Schema.Boolean),
});
export type GitDeleteBranchInput = typeof GitDeleteBranchInput.Type;

// ── Stash Operations ──────────────────────────────────────────────────

export const GitStashEntry = Schema.Struct({
  index: NonNegativeInt,
  message: Schema.String,
  branch: Schema.String.pipe(Schema.NullOr),
  date: Schema.String,
});
export type GitStashEntry = typeof GitStashEntry.Type;

export const GitStashListInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
export type GitStashListInput = typeof GitStashListInput.Type;
export const GitStashListResult = Schema.Struct({ entries: Schema.Array(GitStashEntry) });
export type GitStashListResult = typeof GitStashListResult.Type;

export const GitStashCreateInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  message: Schema.optional(TrimmedNonEmptyStringSchema),
  includeUntracked: Schema.optional(Schema.Boolean),
  filePaths: Schema.optional(
    Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
  ),
});
export type GitStashCreateInput = typeof GitStashCreateInput.Type;

export const GitStashApplyInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
});
export type GitStashApplyInput = typeof GitStashApplyInput.Type;

export const GitStashPopInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
});
export type GitStashPopInput = typeof GitStashPopInput.Type;

export const GitStashDropInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
});
export type GitStashDropInput = typeof GitStashDropInput.Type;

export const GitStashShowInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
});
export type GitStashShowInput = typeof GitStashShowInput.Type;
export const GitStashShowResult = Schema.Struct({ diff: Schema.String });
export type GitStashShowResult = typeof GitStashShowResult.Type;

// ── Worktree List ─────────────────────────────────────────────────────

export const GitListWorktreesInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
export type GitListWorktreesInput = typeof GitListWorktreesInput.Type;

export const GitWorktreeEntry = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  branch: Schema.String.pipe(Schema.NullOr),
  isMainWorktree: Schema.Boolean,
  isBare: Schema.Boolean,
});
export type GitWorktreeEntry = typeof GitWorktreeEntry.Type;

export const GitListWorktreesResult = Schema.Struct({
  worktrees: Schema.Array(GitWorktreeEntry),
});
export type GitListWorktreesResult = typeof GitListWorktreesResult.Type;

// ── Pull Request List ─────────────────────────────────────────────────

export const GitListPullRequestsInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  state: Schema.optional(Schema.Literals(["open", "closed", "all"])),
});
export type GitListPullRequestsInput = typeof GitListPullRequestsInput.Type;

export const GitPullRequestEntry = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["open", "closed", "merged"]),
  baseBranch: Schema.String,
  headBranch: Schema.String,
  authorLogin: Schema.String,
  createdAt: Schema.String,
});
export type GitPullRequestEntry = typeof GitPullRequestEntry.Type;

export const GitListPullRequestsResult = Schema.Struct({
  pullRequests: Schema.Array(GitPullRequestEntry),
});
export type GitListPullRequestsResult = typeof GitListPullRequestsResult.Type;

// ── Git Log (for commit graph) ────────────────────────────────────────

export const GitLogInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  maxCount: Schema.optional(NonNegativeInt),
  skip: Schema.optional(NonNegativeInt),
  branch: Schema.optional(Schema.String),
});
export type GitLogInput = typeof GitLogInput.Type;

export const GitLogEntry = Schema.Struct({
  sha: Schema.String,
  shortSha: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
  authorDate: Schema.String,
  subject: Schema.String,
  body: Schema.String,
  parents: Schema.Array(Schema.String),
  refs: Schema.Array(Schema.String),
});
export type GitLogEntry = typeof GitLogEntry.Type;

export const GitLogResult = Schema.Struct({
  entries: Schema.Array(GitLogEntry),
  hasMore: Schema.Boolean,
});
export type GitLogResult = typeof GitLogResult.Type;

// ── Generate Commit Message ──────────────────────────────────────────

export const GitGenerateCommitMessageInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  filePaths: Schema.optional(
    Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
  ),
});
export type GitGenerateCommitMessageInput = typeof GitGenerateCommitMessageInput.Type;

export const GitGenerateCommitMessageResult = Schema.Struct({
  subject: TrimmedNonEmptyStringSchema,
  body: Schema.String,
});
export type GitGenerateCommitMessageResult = typeof GitGenerateCommitMessageResult.Type;

// ── Stash File-Level Operations ──────────────────────────────────────

export const GitStashShowFilesResult = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: TrimmedNonEmptyStringSchema,
      status: GitFileStatus,
    }),
  ),
});
export type GitStashShowFilesResult = typeof GitStashShowFilesResult.Type;

export const GitStashShowFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
  filePath: TrimmedNonEmptyStringSchema,
});
export type GitStashShowFileInput = typeof GitStashShowFileInput.Type;

export const GitStashShowFileResult = Schema.Struct({ diff: Schema.String });
export type GitStashShowFileResult = typeof GitStashShowFileResult.Type;

export const GitStashRestoreFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  index: NonNegativeInt,
  filePath: TrimmedNonEmptyStringSchema,
});
export type GitStashRestoreFileInput = typeof GitStashRestoreFileInput.Type;

// ── Soft Reset (Uncommit) ────────────────────────────────────────────

export const GitSoftResetInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  sha: TrimmedNonEmptyStringSchema,
});
export type GitSoftResetInput = typeof GitSoftResetInput.Type;

// ── Revert Commit ────────────────────────────────────────────────────

export const GitRevertCommitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  sha: TrimmedNonEmptyStringSchema,
});
export type GitRevertCommitInput = typeof GitRevertCommitInput.Type;
