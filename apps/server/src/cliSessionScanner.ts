import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { createReadStream } from "node:fs";
import type {
  CliSessionScanInput,
  CliSessionScanResult,
  CliSessionReadMessagesInput,
  CliSessionReadMessagesResult,
  CliSessionMeta,
  CliSessionMessage,
} from "@t3tools/contracts";

const MAX_SESSIONS = 50;
const MAX_MESSAGES = 2000;

// ── Path helpers ─────────────────────────────────────────────────────

function cwdToClaudeFolderName(cwd: string): string {
  return cwd
    .split("")
    .map((c) => (/[a-zA-Z0-9]/.test(c) ? c : "-"))
    .join("");
}

function validateFilePath(filePath: string): void {
  const home = os.homedir();
  const claudeBase = path.join(home, ".claude") + path.sep;
  const codexBase = path.join(home, ".codex") + path.sep;
  if (!filePath.startsWith(claudeBase) && !filePath.startsWith(codexBase)) {
    throw new Error("File path must be under ~/.claude/ or ~/.codex/");
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── System message filtering ─────────────────────────────────────────

const SYSTEM_TAG_PREFIXES = [
  "<local-command-caveat>",
  "<command-name>",
  "<local-command-stdout>",
  "<system-reminder>",
  "<system-prompt>",
];

function isSystemInjectedText(text: string): boolean {
  const trimmed = text.trimStart();
  return SYSTEM_TAG_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

// ── Claude text extraction ───────────────────────────────────────────

function extractClaudeText(parsed: any): string {
  const content = parsed.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
  }
  return "";
}

// ── Codex text extraction ────────────────────────────────────────────

function extractCodexText(parsed: any): string {
  const content = parsed.payload?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: any) => b.type === "input_text" || b.type === "output_text")
    .map((b: any) => b.text)
    .join("\n");
}

// ── JSONL line reader ────────────────────────────────────────────────

async function readJsonlLines(filePath: string, maxLines?: number): Promise<any[]> {
  const results: any[] = [];
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (maxLines !== undefined && results.length >= maxLines) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      // skip corrupt lines
    }
  }
  return results;
}

// ── Claude session scanning ──────────────────────────────────────────

interface ClaudeSessionIndex {
  version: number;
  entries: Array<{
    sessionId: string;
    fullPath?: string;
    firstPrompt?: string;
    messageCount?: number;
    created?: string;
    modified?: string;
  }>;
}

interface ClaudeSessionNames {
  [sessionId: string]: string;
}

async function scanClaudeSessions(cwd?: string): Promise<{
  available: boolean;
  sessions: CliSessionMeta[];
}> {
  const home = os.homedir();
  const claudeProjectsDir = path.join(home, ".claude", "projects");

  if (!(await dirExists(claudeProjectsDir))) {
    return { available: false, sessions: [] };
  }

  // If no cwd, scan all project folders
  const folderNames: string[] = [];
  if (cwd) {
    folderNames.push(cwdToClaudeFolderName(cwd));
  } else {
    try {
      const entries = await fs.readdir(claudeProjectsDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.isDirectory()) folderNames.push(entry.name);
      }
    } catch {
      return { available: true, sessions: [] };
    }
  }

  const sessions: CliSessionMeta[] = [];

  for (const folderName of folderNames) {
    const folderPath = path.join(claudeProjectsDir, folderName);
    if (!(await dirExists(folderPath))) continue;

    // Read index files
    const index = await readJsonSafe<ClaudeSessionIndex>(
      path.join(folderPath, "sessions-index.json"),
    );
    const names = await readJsonSafe<ClaudeSessionNames>(
      path.join(folderPath, "session-names.json"),
    );

    // List .jsonl files
    let jsonlFiles: string[] = [];
    try {
      const entries = await fs.readdir(folderPath);
      jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of jsonlFiles) {
      const sessionId = file.replace(".jsonl", "");
      const filePath = path.join(folderPath, file);

      // Look up index entry
      const indexEntry = index?.entries?.find((e) => e.sessionId === sessionId);

      // Determine title: custom name > index firstPrompt > read from file
      let title = names?.[sessionId] ?? indexEntry?.firstPrompt ?? "";
      if (!title) {
        // Read first few lines to find first user message
        const lines = await readJsonlLines(filePath, 50);
        for (const line of lines) {
          if (line.type === "user") {
            title = extractClaudeText(line);
            break;
          }
        }
      }
      if (!title) title = `Session ${sessionId.slice(0, 8)}`;
      // Truncate long titles
      if (title.length > 100) title = title.slice(0, 97) + "...";

      // Get timestamps from index or file stat
      let createdAt = indexEntry?.created;
      let updatedAt = indexEntry?.modified;
      if (!updatedAt) {
        try {
          const stat = await fs.stat(filePath);
          updatedAt = stat.mtime.toISOString();
          createdAt = createdAt ?? stat.birthtime.toISOString();
        } catch {
          // skip
        }
      }

      sessions.push({
        id: sessionId,
        source: "claude",
        title,
        filePath,
        messageCount: indexEntry?.messageCount,
        createdAt,
        updatedAt,
      });
    }
  }

  // Sort by updatedAt desc
  sessions.sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  return { available: true, sessions: sessions.slice(0, MAX_SESSIONS) };
}

// ── Codex session scanning ───────────────────────────────────────────

interface CodexIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

async function findCodexJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findCodexJsonlFiles(fullPath)));
      } else if (
        entry.isFile() &&
        entry.name.startsWith("rollout-") &&
        entry.name.endsWith(".jsonl")
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // skip inaccessible dirs
  }
  return results;
}

async function scanCodexSessions(cwd?: string): Promise<{
  available: boolean;
  sessions: CliSessionMeta[];
}> {
  const home = os.homedir();
  const codexSessionsDir = path.join(home, ".codex", "sessions");

  if (!(await dirExists(codexSessionsDir))) {
    return { available: false, sessions: [] };
  }

  // Read session index
  const indexPath = path.join(home, ".codex", "session_index.jsonl");
  const indexMap = new Map<string, CodexIndexEntry>();
  if (await fileExists(indexPath)) {
    const lines = await readJsonlLines(indexPath);
    for (const entry of lines) {
      if (entry.id) {
        indexMap.set(entry.id, entry as CodexIndexEntry);
      }
    }
  }

  // Find all rollout JSONL files
  const jsonlFiles = await findCodexJsonlFiles(codexSessionsDir);

  const sessions: CliSessionMeta[] = [];

  for (const filePath of jsonlFiles) {
    // Extract session id from filename: rollout-YYYY-MM-DDTHH-MM-SS-{session-id}.jsonl
    const basename = path.basename(filePath, ".jsonl");
    // Format: rollout-2026-03-28T10-30-00-uuid-here
    // The session ID is everything after the timestamp prefix
    const match = basename.match(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)$/);
    const sessionId = match?.[1] ?? basename;

    const indexEntry = indexMap.get(sessionId);

    // If cwd is specified, check if session matches the project
    if (cwd) {
      // Read session_meta from the first line
      const lines = await readJsonlLines(filePath, 1);
      const meta = lines[0];
      if (meta?.type === "session_meta" && meta.payload?.cwd) {
        if (meta.payload.cwd !== cwd) continue;
      }
    }

    // Determine title
    let title = indexEntry?.thread_name ?? "";
    if (!title) {
      // Read first user message from file
      const lines = await readJsonlLines(filePath, 30);
      for (const line of lines) {
        if (line.type === "response_item" && line.payload?.role === "user") {
          title = extractCodexText(line);
          break;
        }
      }
    }
    if (!title) title = `Codex Session ${sessionId.slice(0, 8)}`;
    if (title.length > 100) title = title.slice(0, 97) + "...";

    // Get timestamps
    let updatedAt = indexEntry?.updated_at;
    if (!updatedAt) {
      try {
        const stat = await fs.stat(filePath);
        updatedAt = stat.mtime.toISOString();
      } catch {
        // skip
      }
    }

    sessions.push({
      id: sessionId,
      source: "codex",
      title,
      filePath,
      createdAt: updatedAt, // codex index doesn't have separate created_at
      updatedAt,
    });
  }

  // Sort by updatedAt desc
  sessions.sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  return { available: true, sessions: sessions.slice(0, MAX_SESSIONS) };
}

// ── Public API ───────────────────────────────────────────────────────

export async function scanCliSessions(input: CliSessionScanInput): Promise<CliSessionScanResult> {
  const [claude, codex] = await Promise.all([
    scanClaudeSessions(input.cwd),
    scanCodexSessions(input.cwd),
  ]);
  return { claude, codex };
}

export async function readCliSessionMessages(
  input: CliSessionReadMessagesInput,
): Promise<CliSessionReadMessagesResult> {
  validateFilePath(input.filePath);

  if (!(await fileExists(input.filePath))) {
    return { messages: [] };
  }

  const messages: CliSessionMessage[] = [];
  const stream = createReadStream(input.filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (messages.length >= MAX_MESSAGES) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // skip corrupt lines
    }

    if (input.source === "claude") {
      if (parsed.type === "user" || parsed.type === "assistant") {
        const text = extractClaudeText(parsed);
        if (text && !isSystemInjectedText(text)) {
          messages.push({
            role: parsed.type as "user" | "assistant",
            text,
            timestamp: parsed.timestamp,
          });
        }
      }
    } else {
      // codex
      if (
        parsed.type === "response_item" &&
        (parsed.payload?.role === "user" || parsed.payload?.role === "assistant")
      ) {
        const text = extractCodexText(parsed);
        if (text && !isSystemInjectedText(text)) {
          messages.push({
            role: parsed.payload.role as "user" | "assistant",
            text,
            timestamp: parsed.timestamp,
          });
        }
      }
    }
  }

  return { messages };
}
