import { Schema } from "effect";

export const CliSessionSource = Schema.Literals(["claude", "codex"]);
export type CliSessionSource = typeof CliSessionSource.Type;

export const CliSessionMeta = Schema.Struct({
  id: Schema.String,
  source: CliSessionSource,
  title: Schema.String,
  filePath: Schema.String,
  messageCount: Schema.optional(Schema.Number),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type CliSessionMeta = typeof CliSessionMeta.Type;

export const CliSessionScanInput = Schema.Struct({
  cwd: Schema.optional(Schema.String),
});
export type CliSessionScanInput = typeof CliSessionScanInput.Type;

export const CliSessionScanResult = Schema.Struct({
  claude: Schema.Struct({
    available: Schema.Boolean,
    sessions: Schema.Array(CliSessionMeta),
  }),
  codex: Schema.Struct({
    available: Schema.Boolean,
    sessions: Schema.Array(CliSessionMeta),
  }),
});
export type CliSessionScanResult = typeof CliSessionScanResult.Type;

export const CliSessionMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  timestamp: Schema.optional(Schema.String),
});
export type CliSessionMessage = typeof CliSessionMessage.Type;

export const CliSessionReadMessagesInput = Schema.Struct({
  source: CliSessionSource,
  filePath: Schema.String,
});
export type CliSessionReadMessagesInput = typeof CliSessionReadMessagesInput.Type;

export const CliSessionReadMessagesResult = Schema.Struct({
  messages: Schema.Array(CliSessionMessage),
});
export type CliSessionReadMessagesResult = typeof CliSessionReadMessagesResult.Type;
