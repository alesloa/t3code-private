import { Schema } from "effect";
import { GuideId, IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

// ── Enumerations ─────────────────────────────────────────────────────

export const GuideScope = Schema.Literals(["project", "directory", "file", "topic"]);
export type GuideScope = typeof GuideScope.Type;

export const GuideDepth = Schema.Literals(["quick", "full"]);
export type GuideDepth = typeof GuideDepth.Type;

export const GuideStatus = Schema.Literals(["queued", "generating", "completed", "failed"]);
export type GuideStatus = typeof GuideStatus.Type;

// ── Guide Metadata (persisted as JSON alongside HTML) ────────────────

export const GuideMeta = Schema.Struct({
  id: GuideId,
  title: TrimmedNonEmptyString,
  projectCwd: TrimmedNonEmptyString,
  scope: GuideScope,
  /** Relative path within project (empty string for project/topic scope) */
  targetPath: Schema.String,
  /** Freeform topic description when scope is "topic" */
  topicQuery: Schema.NullOr(Schema.String),
  depth: GuideDepth,
  status: GuideStatus,
  errorMessage: Schema.NullOr(Schema.String),
  /** Filename of the HTML output (relative to guides dir) */
  htmlFilename: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type GuideMeta = typeof GuideMeta.Type;

// ── RPC Input/Output Schemas ─────────────────────────────────────────

export const GuideListInput = Schema.Struct({
  projectCwd: Schema.optional(TrimmedNonEmptyString),
});
export type GuideListInput = typeof GuideListInput.Type;

export const GuideListResult = Schema.Struct({
  guides: Schema.Array(GuideMeta),
});
export type GuideListResult = typeof GuideListResult.Type;

export const GuideGenerateInput = Schema.Struct({
  projectCwd: TrimmedNonEmptyString,
  scope: GuideScope,
  targetPath: Schema.String,
  depth: GuideDepth,
  topicQuery: Schema.optional(Schema.String),
  title: Schema.optional(TrimmedNonEmptyString),
});
export type GuideGenerateInput = typeof GuideGenerateInput.Type;

export const GuideGenerateResult = Schema.Struct({
  guide: GuideMeta,
});
export type GuideGenerateResult = typeof GuideGenerateResult.Type;

export const GuideReadInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideReadInput = typeof GuideReadInput.Type;

export const GuideReadResult = Schema.Struct({
  guide: GuideMeta,
  html: Schema.String,
});
export type GuideReadResult = typeof GuideReadResult.Type;

export const GuideDeleteInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideDeleteInput = typeof GuideDeleteInput.Type;

export const GuideDeleteResult = Schema.Struct({
  guideId: GuideId,
});
export type GuideDeleteResult = typeof GuideDeleteResult.Type;

export const GuideRegenerateInput = Schema.Struct({
  guideId: GuideId,
});
export type GuideRegenerateInput = typeof GuideRegenerateInput.Type;

export const GuideRegenerateResult = Schema.Struct({
  guide: GuideMeta,
});
export type GuideRegenerateResult = typeof GuideRegenerateResult.Type;

// ── Push Event for generation progress ───────────────────────────────

export const GuideProgressEvent = Schema.Struct({
  guideId: GuideId,
  status: GuideStatus,
  message: Schema.String,
  /** 0-100 progress percentage, null if indeterminate */
  percent: Schema.NullOr(Schema.Number),
  updatedMeta: Schema.optional(GuideMeta),
});
export type GuideProgressEvent = typeof GuideProgressEvent.Type;
