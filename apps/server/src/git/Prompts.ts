/**
 * Shared prompt builders for text generation providers.
 *
 * Extracts the prompt construction logic that is identical across
 * Codex, Claude, and any future CLI-based text generation backends.
 *
 * @module textGenerationPrompts
 */
import { Schema } from "effect";
import type { ChatAttachment } from "@t3tools/contracts";

import { limitSection } from "./Utils.ts";

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

export interface CommitMessagePromptInput {
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch: boolean;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch;

  const prompt = [
    "You are an expert at writing comprehensive Git commits using the Conventional Commits format with emojis.",
    "Your job is to analyze ALL changes in the diff and write a detailed commit message.",
    "",
    wantsBranch
      ? "Return a JSON object with keys: subject, body, branch."
      : "Return a JSON object with keys: subject, body.",
    "",
    "## Format",
    "subject: <emoji> <type>: <description>",
    "body: bullet points listing each distinct change",
    "",
    "## Commit Types and Emojis",
    "- ✨ feat: A new feature",
    "- 🐛 fix: A bug fix",
    "- 📝 docs: Documentation changes",
    "- 💄 style: Code style changes (formatting, whitespace)",
    "- ♻️ refactor: Code refactoring (no feature or bug fix)",
    "- ⚡️ perf: Performance improvements",
    "- ✅ test: Adding or updating tests",
    "- 🔧 chore: Maintenance tasks, configs, dependencies",
    "- 🏗️ build: Build system or external dependencies",
    "- 👷 ci: CI/CD configuration changes",
    "",
    "## Rules",
    "- ALWAYS include a body with bullet points listing each distinct change",
    "- Analyze the entire diff - don't miss any modified files or features",
    "- Each bullet should describe ONE specific change",
    "- Group related changes together",
    '- Use imperative mood ("Add" not "Added")',
    "- Keep subject line under 72 characters",
    "- Be specific - mention file names, function names, or components when relevant",
    "- If multiple types of changes exist (feat + fix), use the primary type but list all changes",
    ...(wantsBranch
      ? ["- branch must be a short semantic git branch fragment for this change"]
      : []),
    "",
    `Branch: ${input.branch ?? "(detached)"}`,
    "",
    "Here are the changes in this commit:",
    "",
    "Staged files:",
    limitSection(input.stagedSummary, 6_000),
    "",
    "Staged patch:",
    limitSection(input.stagedPatch, 40_000),
  ].join("\n");

  if (wantsBranch) {
    return {
      prompt,
      outputSchema: Schema.Struct({
        subject: Schema.String,
        body: Schema.String,
        branch: Schema.String,
      }),
    };
  }

  return {
    prompt,
    outputSchema: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
  };
}

// ---------------------------------------------------------------------------
// PR content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
}

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const prompt = [
    "You write GitHub pull request content.",
    "Return a JSON object with keys: title, body.",
    "Rules:",
    "- title should be concise and specific",
    "- body must be markdown and include headings '## Summary' and '## Testing'",
    "- under Summary, provide short bullet points",
    "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
    "",
    `Base branch: ${input.baseBranch}`,
    `Head branch: ${input.headBranch}`,
    "",
    "Commits:",
    limitSection(input.commitSummary, 12_000),
    "",
    "Diff stat:",
    limitSection(input.diffSummary, 12_000),
    "",
    "Diff patch:",
    limitSection(input.diffPatch, 40_000),
  ].join("\n");

  const outputSchema = Schema.Struct({
    title: Schema.String,
    body: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

export interface BranchNamePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
}

export function buildBranchNamePrompt(input: BranchNamePromptInput) {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const promptSections = [
    "You generate concise git branch names.",
    "Return a JSON object with key: branch.",
    "Rules:",
    "- Branch should describe the requested work from the user message.",
    "- Keep it short and specific (2-6 words).",
    "- Use plain words only, no issue prefixes and no punctuation-heavy text.",
    "- If images are attached, use them as primary context for visual/UI issues.",
    "",
    "User message:",
    limitSection(input.message, 8_000),
  ];
  if (attachmentLines.length > 0) {
    promptSections.push(
      "",
      "Attachment metadata:",
      limitSection(attachmentLines.join("\n"), 4_000),
    );
  }

  const prompt = promptSections.join("\n");
  const outputSchema = Schema.Struct({
    branch: Schema.String,
  });

  return { prompt, outputSchema };
}
