/**
 * GuideManager - Manages guide lifecycle: CRUD for metadata, spawning `claude`
 * CLI to generate HTML documentation guides.
 *
 * Storage layout: Each guide gets a directory `{guidesDir}/{guideId}/` containing:
 * - `meta.json` — the guide metadata
 * - `guide.html` — the generated HTML file
 *
 * @module GuideManager
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import type {
  GuideId,
  GuideMeta,
  GuideGenerateInput,
  GuideListInput,
  GuideListResult,
  GuideReadInput,
  GuideReadResult,
  GuideDeleteInput,
  GuideDeleteResult,
  GuideRegenerateInput,
  GuideRegenerateResult,
  GuideGenerateResult,
  GuideProgressEvent,
} from "@t3tools/contracts";

import { buildGuidePrompt } from "./guidePrompts";

// ── Types ───────────────────────────────────────────────────────────

export type GuideProgressCallback = (event: GuideProgressEvent) => void;

export interface GuideManagerShape {
  readonly list: (input: GuideListInput) => Promise<GuideListResult>;
  readonly generate: (
    input: GuideGenerateInput,
    onProgress: GuideProgressCallback,
  ) => Promise<GuideGenerateResult>;
  readonly read: (input: GuideReadInput) => Promise<GuideReadResult>;
  readonly remove: (input: GuideDeleteInput) => Promise<GuideDeleteResult>;
  readonly regenerate: (
    input: GuideRegenerateInput,
    onProgress: GuideProgressCallback,
  ) => Promise<GuideRegenerateResult>;
}

// ── Helpers ─────────────────────────────────────────────────────────

const META_FILENAME = "meta.json";
const HTML_FILENAME = "guide.html";

function nowIso(): string {
  return new Date().toISOString();
}

function guideDir(guidesDir: string, guideId: string): string {
  return path.join(guidesDir, guideId);
}

function metaPath(guidesDir: string, guideId: string): string {
  return path.join(guideDir(guidesDir, guideId), META_FILENAME);
}

function htmlPath(guidesDir: string, guideId: string): string {
  return path.join(guideDir(guidesDir, guideId), HTML_FILENAME);
}

function autoTitle(
  scope: GuideMeta["scope"],
  targetPath: string,
  topicQuery: string | null,
): string {
  switch (scope) {
    case "project":
      return "Full Project Guide";
    case "directory":
      return `${path.basename(targetPath)} Guide`;
    case "file":
      return `${path.basename(targetPath)} Explained`;
    case "topic": {
      if (!topicQuery) return "Topic Guide";
      // Truncate long queries to a reasonable title length
      const cleaned = topicQuery.replace(/\s+/g, " ").trim();
      return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57)}...`;
    }
  }
}

async function readMeta(guidesDir: string, guideId: string): Promise<GuideMeta> {
  const raw = await fs.readFile(metaPath(guidesDir, guideId), "utf-8");
  return JSON.parse(raw) as GuideMeta;
}

async function writeMeta(guidesDir: string, guideId: string, meta: GuideMeta): Promise<void> {
  await fs.writeFile(metaPath(guidesDir, guideId), JSON.stringify(meta, null, 2), "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── GuideManager ────────────────────────────────────────────────────

export class GuideManager implements GuideManagerShape {
  private readonly guidesDir: string;
  private readonly activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
  private dirEnsured = false;

  constructor(guidesDir: string) {
    this.guidesDir = guidesDir;
  }

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;
    await fs.mkdir(this.guidesDir, { recursive: true });
    this.dirEnsured = true;
  }

  // ── list ─────────────────────────────────────────────────────────

  async list(input: GuideListInput): Promise<GuideListResult> {
    await this.ensureDir();

    let entries: string[];
    try {
      entries = await fs.readdir(this.guidesDir);
    } catch {
      return { guides: [] };
    }

    const guides: GuideMeta[] = [];

    for (const entry of entries) {
      const mp = path.join(this.guidesDir, entry, META_FILENAME);
      try {
        const raw = await fs.readFile(mp, "utf-8");
        const meta = JSON.parse(raw) as GuideMeta;
        if (input.projectCwd && meta.projectCwd !== input.projectCwd) {
          continue;
        }
        guides.push(meta);
      } catch {
        // Skip directories without valid meta.json
      }
    }

    return { guides };
  }

  // ── generate ─────────────────────────────────────────────────────

  async generate(
    input: GuideGenerateInput,
    onProgress: GuideProgressCallback,
  ): Promise<GuideGenerateResult> {
    await this.ensureDir();

    const guideId = randomUUID() as GuideId;
    const dir = guideDir(this.guidesDir, guideId);
    await fs.mkdir(dir, { recursive: true });

    const title = input.title ?? autoTitle(input.scope, input.targetPath, input.topicQuery ?? null);
    const now = nowIso();

    const meta: GuideMeta = {
      id: guideId,
      title,
      projectCwd: input.projectCwd,
      scope: input.scope,
      targetPath: input.targetPath,
      topicQuery: input.topicQuery ?? null,
      depth: input.depth,
      status: "queued",
      errorMessage: null,
      htmlFilename: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeMeta(this.guidesDir, guideId, meta);

    onProgress({
      guideId,
      status: "queued",
      message: "Guide generation queued",
      percent: 0,
    });

    const finalMeta = await this.runGeneration(guideId, meta, input.projectCwd, onProgress);
    return { guide: finalMeta };
  }

  // ── read ─────────────────────────────────────────────────────────

  async read(input: GuideReadInput): Promise<GuideReadResult> {
    const meta = await readMeta(this.guidesDir, input.guideId);
    const hp = htmlPath(this.guidesDir, input.guideId);

    let html = "";
    if (await fileExists(hp)) {
      html = await fs.readFile(hp, "utf-8");
    }

    return { guide: meta, html };
  }

  // ── remove ───────────────────────────────────────────────────────

  async remove(input: GuideDeleteInput): Promise<GuideDeleteResult> {
    // Kill active generation if running
    const active = this.activeProcesses.get(input.guideId);
    if (active) {
      active.kill("SIGTERM");
      this.activeProcesses.delete(input.guideId);
    }

    const dir = guideDir(this.guidesDir, input.guideId);
    await fs.rm(dir, { recursive: true, force: true });

    return { guideId: input.guideId };
  }

  // ── regenerate ───────────────────────────────────────────────────

  async regenerate(
    input: GuideRegenerateInput,
    onProgress: GuideProgressCallback,
  ): Promise<GuideRegenerateResult> {
    const existingMeta = await readMeta(this.guidesDir, input.guideId);

    // Delete old HTML if it exists
    const hp = htmlPath(this.guidesDir, input.guideId);
    if (await fileExists(hp)) {
      await fs.unlink(hp);
    }

    // Reset meta to queued state
    const now = nowIso();
    const meta: GuideMeta = {
      ...existingMeta,
      status: "queued",
      errorMessage: null,
      htmlFilename: null,
      updatedAt: now,
    };
    await writeMeta(this.guidesDir, input.guideId, meta);

    onProgress({
      guideId: input.guideId,
      status: "queued",
      message: "Guide regeneration queued",
      percent: 0,
    });

    const finalMeta = await this.runGeneration(
      input.guideId,
      meta,
      existingMeta.projectCwd,
      onProgress,
    );
    return { guide: finalMeta };
  }

  // ── Internal: run generation via claude CLI ──────────────────────

  private async runGeneration(
    guideId: string,
    meta: GuideMeta,
    projectCwd: string,
    onProgress: GuideProgressCallback,
  ): Promise<GuideMeta> {
    const outputPath = htmlPath(this.guidesDir, guideId);
    const projectName = path.basename(projectCwd);

    const prompt = buildGuidePrompt({
      scope: meta.scope,
      depth: meta.depth,
      projectCwd,
      targetPath: meta.targetPath,
      topicQuery: meta.topicQuery ?? null,
      projectName,
      outputPath,
    });

    // Update status to generating
    let currentMeta: GuideMeta = {
      ...meta,
      status: "generating",
      updatedAt: nowIso(),
    };
    await writeMeta(this.guidesDir, guideId, currentMeta);

    onProgress({
      guideId: guideId as GuideId,
      status: "generating",
      message: "Starting guide generation...",
      percent: 5,
    });

    return new Promise<GuideMeta>((resolve) => {
      const child = spawn(
        "claude",
        ["--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose", "-p", prompt],
        {
          cwd: projectCwd,
          stdio: ["pipe", "pipe", "pipe"],
          shell: process.platform === "win32",
        },
      );

      this.activeProcesses.set(guideId, child);

      const rl = readline.createInterface({ input: child.stdout });
      let stderrBuffer = "";

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderrBuffer += typeof chunk === "string" ? chunk : chunk.toString();
      });

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed.type === "assistant") {
            onProgress({
              guideId: guideId as GuideId,
              status: "generating",
              message: "Generating guide content...",
              percent: null,
            });
          }
        } catch {
          // Non-JSON line, ignore
        }
      });

      child.stdin.end();

      child.once("close", async (code) => {
        this.activeProcesses.delete(guideId);
        rl.close();

        if (code === 0 && (await fileExists(outputPath))) {
          // Try to extract a better title from the generated HTML <title> tag
          let extractedTitle: string | null = null;
          try {
            const html = await fs.readFile(outputPath, "utf-8");
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch?.[1]) {
              const cleaned = titleMatch[1].trim();
              if (cleaned.length > 0 && cleaned.length <= 120) {
                extractedTitle = cleaned;
              }
            }
          } catch {
            // Ignore — keep the auto-generated title
          }

          currentMeta = {
            ...currentMeta,
            status: "completed",
            htmlFilename: HTML_FILENAME,
            errorMessage: null,
            updatedAt: nowIso(),
            ...(extractedTitle ? { title: extractedTitle } : {}),
          };
          await writeMeta(this.guidesDir, guideId, currentMeta);

          onProgress({
            guideId: guideId as GuideId,
            status: "completed",
            message: "Guide generation completed",
            percent: 100,
            updatedMeta: currentMeta,
          });
        } else {
          const errorMessage =
            stderrBuffer.trim() || `Claude CLI exited with code ${code ?? "null"}`;
          currentMeta = {
            ...currentMeta,
            status: "failed",
            errorMessage,
            updatedAt: nowIso(),
          };
          await writeMeta(this.guidesDir, guideId, currentMeta);

          onProgress({
            guideId: guideId as GuideId,
            status: "failed",
            message: errorMessage,
            percent: null,
            updatedMeta: currentMeta,
          });
        }

        resolve(currentMeta);
      });

      child.once("error", async (err) => {
        this.activeProcesses.delete(guideId);

        const errorMessage = `Failed to spawn claude CLI: ${err.message}`;
        currentMeta = {
          ...currentMeta,
          status: "failed",
          errorMessage,
          updatedAt: nowIso(),
        };
        await writeMeta(this.guidesDir, guideId, currentMeta);

        onProgress({
          guideId: guideId as GuideId,
          status: "failed",
          message: errorMessage,
          percent: null,
          updatedMeta: currentMeta,
        });

        resolve(currentMeta);
      });
    });
  }
}
