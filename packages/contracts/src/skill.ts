import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// ── Skill Data Model ─────────────────────────────────────────────────

export const SkillSource = Schema.Struct({
  type: Schema.Literal("github"),
  url: TrimmedNonEmptyString,
});
export type SkillSource = typeof SkillSource.Type;

export const SkillScope = Schema.Literals(["global", "project"]);
export type SkillScope = typeof SkillScope.Type;

export const Skill = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  version: Schema.optional(TrimmedNonEmptyString),
  allowedTools: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  body: Schema.String,
  source: Schema.optional(SkillSource),
  iconBase64: Schema.optional(Schema.String),
  scope: SkillScope,
});
export type Skill = typeof Skill.Type;

// ── Input / Result Schemas ───────────────────────────────────────────

export const SkillListInput = Schema.Struct({
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillListInput = typeof SkillListInput.Type;

export const SkillListResult = Schema.Struct({
  skills: Schema.Array(Skill),
});
export type SkillListResult = typeof SkillListResult.Type;

export const SkillGetInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillGetInput = typeof SkillGetInput.Type;

export const SkillCreateInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  version: Schema.optional(TrimmedNonEmptyString),
  allowedTools: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  body: Schema.String,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillCreateInput = typeof SkillCreateInput.Type;

export const SkillUpdateInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  version: Schema.optional(TrimmedNonEmptyString),
  allowedTools: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  body: Schema.String,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillUpdateInput = typeof SkillUpdateInput.Type;

export const SkillDeleteInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillDeleteInput = typeof SkillDeleteInput.Type;

export const SkillDeleteResult = Schema.Struct({
  dirName: TrimmedNonEmptyString,
});
export type SkillDeleteResult = typeof SkillDeleteResult.Type;

export const SkillImportGithubInput = Schema.Struct({
  url: TrimmedNonEmptyString,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillImportGithubInput = typeof SkillImportGithubInput.Type;

export const SkillUpdateIconInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  iconBase64: Schema.String,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillUpdateIconInput = typeof SkillUpdateIconInput.Type;

export const SkillOpenFolderInput = Schema.Struct({
  dirName: TrimmedNonEmptyString,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type SkillOpenFolderInput = typeof SkillOpenFolderInput.Type;
