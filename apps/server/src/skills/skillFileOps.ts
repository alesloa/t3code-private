import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Skill, SkillScope } from "@t3tools/contracts";
import { runProcess } from "../processRunner";
import { getSkillsDir } from "./skillsDir";
import { parseSkillMd, serializeSkillMd } from "./parseSkillMd";

const SKILL_FILENAME = "SKILL.md";
const ICON_FILENAME = "icon.png";
const PROJECT_COMMANDS_REL = path.join(".claude", "commands");

function resolveSkillsDir(cwd?: string | undefined): { dir: string; scope: SkillScope } {
  if (cwd) {
    return { dir: path.join(cwd, PROJECT_COMMANDS_REL), scope: "project" };
  }
  return { dir: getSkillsDir(), scope: "global" };
}

async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readIconBase64(skillDir: string): Promise<string | undefined> {
  try {
    const iconPath = path.join(skillDir, ICON_FILENAME);
    const buffer = await fs.readFile(iconPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

// ── Global skill reader (directory with SKILL.md) ───────────────────

async function readGlobalSkillFromDir(skillsDir: string, dirName: string): Promise<Skill | null> {
  const skillDir = path.join(skillsDir, dirName);
  const skillPath = path.join(skillDir, SKILL_FILENAME);

  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  try {
    const content = await fs.readFile(skillPath, "utf-8");
    const parsed = parseSkillMd(content);
    const iconBase64 = await readIconBase64(skillDir);

    let source: Skill["source"];
    try {
      await fs.stat(path.join(skillDir, ".git"));
      const result = await runProcess("git", ["remote", "get-url", "origin"], {
        cwd: skillDir,
        allowNonZeroExit: true,
        timeoutMs: 5_000,
      });
      if (result.code === 0 && result.stdout.trim()) {
        source = { type: "github", url: result.stdout.trim() };
      }
    } catch {
      // Not a git repo
    }

    return {
      dirName,
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      allowedTools: parsed.allowedTools,
      body: parsed.body,
      source,
      iconBase64,
      scope: "global",
    };
  } catch {
    return null;
  }
}

// ── Project command reader (flat .md files) ─────────────────────────

async function readProjectCommand(commandsDir: string, fileName: string): Promise<Skill | null> {
  if (!fileName.endsWith(".md")) return null;
  const filePath = path.join(commandsDir, fileName);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseSkillMd(content);
    const dirName = fileName.replace(/\.md$/, "");

    return {
      dirName,
      name: parsed.name !== "Untitled" ? parsed.name : dirName,
      description: parsed.description,
      version: parsed.version,
      allowedTools: parsed.allowedTools,
      body: parsed.body,
      scope: "project",
    };
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function listSkills(input?: {
  cwd?: string | undefined;
}): Promise<{ skills: Skill[] }> {
  const { dir, scope } = resolveSkillsDir(input?.cwd);
  await ensureDir(dir);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { skills: [] };
  }

  const skills: Skill[] = [];
  for (const entry of entries.toSorted()) {
    const skill =
      scope === "global"
        ? await readGlobalSkillFromDir(dir, entry)
        : await readProjectCommand(dir, entry);
    if (skill) skills.push(skill);
  }

  return { skills };
}

export async function getSkill(input: {
  dirName: string;
  cwd?: string | undefined;
}): Promise<Skill> {
  const { dir, scope } = resolveSkillsDir(input.cwd);
  await ensureDir(dir);

  const skill =
    scope === "global"
      ? await readGlobalSkillFromDir(dir, input.dirName)
      : await readProjectCommand(dir, `${input.dirName}.md`);
  if (!skill) {
    throw new Error(`Skill '${input.dirName}' not found.`);
  }
  return skill;
}

export async function createSkill(input: {
  dirName: string;
  name: string;
  description?: string | undefined;
  version?: string | undefined;
  allowedTools?: readonly string[] | undefined;
  body: string;
  cwd?: string | undefined;
}): Promise<Skill> {
  const { dir, scope } = resolveSkillsDir(input.cwd);
  await ensureDir(dir);

  const content = serializeSkillMd({
    name: input.name,
    description: input.description,
    version: input.version,
    allowedTools: input.allowedTools,
    body: input.body,
  });

  if (scope === "project") {
    const filePath = path.join(dir, `${input.dirName}.md`);
    try {
      await fs.stat(filePath);
      throw new Error(`Command '${input.dirName}' already exists in this project.`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) throw err;
    }
    await fs.writeFile(filePath, content, "utf-8");
  } else {
    const skillDir = path.join(dir, input.dirName);
    try {
      await fs.stat(skillDir);
      throw new Error(`Skill directory '${input.dirName}' already exists.`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) throw err;
    }
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, SKILL_FILENAME), content, "utf-8");
  }

  return {
    dirName: input.dirName,
    name: input.name,
    description: input.description,
    version: input.version,
    allowedTools: input.allowedTools,
    body: input.body,
    scope,
  };
}

export async function updateSkill(input: {
  dirName: string;
  name: string;
  description?: string | undefined;
  version?: string | undefined;
  allowedTools?: readonly string[] | undefined;
  body: string;
  cwd?: string | undefined;
}): Promise<Skill> {
  const { dir, scope } = resolveSkillsDir(input.cwd);

  const content = serializeSkillMd({
    name: input.name,
    description: input.description,
    version: input.version,
    allowedTools: input.allowedTools,
    body: input.body,
  });

  if (scope === "project") {
    const filePath = path.join(dir, `${input.dirName}.md`);
    try {
      await fs.stat(filePath);
    } catch {
      throw new Error(`Command '${input.dirName}' not found.`);
    }
    await fs.writeFile(filePath, content, "utf-8");
  } else {
    const skillPath = path.join(dir, input.dirName, SKILL_FILENAME);
    try {
      await fs.stat(skillPath);
    } catch {
      throw new Error(`Skill '${input.dirName}' not found.`);
    }
    await fs.writeFile(skillPath, content, "utf-8");
  }

  const iconBase64 =
    scope === "global" ? await readIconBase64(path.join(dir, input.dirName)) : undefined;

  return {
    dirName: input.dirName,
    name: input.name,
    description: input.description,
    version: input.version,
    allowedTools: input.allowedTools,
    body: input.body,
    iconBase64,
    scope,
  };
}

export async function deleteSkill(input: {
  dirName: string;
  cwd?: string | undefined;
}): Promise<{ dirName: string }> {
  const { dir, scope } = resolveSkillsDir(input.cwd);

  if (scope === "project") {
    const filePath = path.join(dir, `${input.dirName}.md`);
    try {
      await fs.stat(filePath);
    } catch {
      throw new Error(`Command '${input.dirName}' not found.`);
    }
    await fs.rm(filePath);
  } else {
    const skillDir = path.join(dir, input.dirName);
    try {
      await fs.stat(skillDir);
    } catch {
      throw new Error(`Skill '${input.dirName}' not found.`);
    }
    await fs.rm(skillDir, { recursive: true, force: true });
  }

  return { dirName: input.dirName };
}

function extractRepoName(url: string): string {
  const cleaned = url.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  const name = parts[parts.length - 1];
  if (!name || name.length === 0) {
    throw new Error(`Could not extract repository name from URL: ${url}`);
  }
  return name;
}

export async function importFromGithub(input: {
  url: string;
  cwd?: string | undefined;
}): Promise<Skill> {
  const { dir } = resolveSkillsDir(input.cwd);
  await ensureDir(dir);
  const repoName = extractRepoName(input.url);
  const targetDir = path.join(dir, repoName);

  try {
    await fs.stat(targetDir);
    throw new Error(`Skill directory '${repoName}' already exists. Delete it first to reimport.`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) throw err;
  }

  await runProcess("git", ["clone", "--depth", "1", input.url, targetDir], {
    timeoutMs: 60_000,
  });

  const skillPath = path.join(targetDir, SKILL_FILENAME);
  try {
    await fs.stat(skillPath);
  } catch {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw new Error(`Repository does not contain a ${SKILL_FILENAME} file. It has been removed.`);
  }

  const skill = await readGlobalSkillFromDir(dir, repoName);
  if (!skill) {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw new Error(`Failed to parse skill from cloned repository.`);
  }

  return skill;
}

export async function updateSkillIcon(input: {
  dirName: string;
  iconBase64: string;
  cwd?: string | undefined;
}): Promise<Skill> {
  const { dir, scope } = resolveSkillsDir(input.cwd);
  const skillDir = scope === "global" ? path.join(dir, input.dirName) : dir;

  if (scope === "global") {
    try {
      await fs.stat(path.join(skillDir, SKILL_FILENAME));
    } catch {
      throw new Error(`Skill '${input.dirName}' not found.`);
    }
  }

  const match = input.iconBase64.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid icon data. Expected a base64-encoded data URL.");
  }

  const iconDir = scope === "global" ? skillDir : path.join(dir, input.dirName);
  await fs.mkdir(iconDir, { recursive: true });
  const buffer = Buffer.from(match[1]!, "base64");
  await fs.writeFile(path.join(iconDir, ICON_FILENAME), buffer);

  const skill =
    scope === "global"
      ? await readGlobalSkillFromDir(dir, input.dirName)
      : await readProjectCommand(dir, `${input.dirName}.md`);
  if (!skill) {
    throw new Error(`Failed to read skill after updating icon.`);
  }
  return skill;
}

export async function openSkillFolder(input: {
  dirName: string;
  cwd?: string | undefined;
}): Promise<void> {
  const { dir, scope } = resolveSkillsDir(input.cwd);
  const targetDir = scope === "global" ? path.join(dir, input.dirName) : dir;

  try {
    await fs.stat(targetDir);
  } catch {
    throw new Error(`Skill folder not found: ${targetDir}`);
  }

  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [targetDir], { detached: true, stdio: "ignore" }).unref();
}
