/**
 * Parse and serialize SKILL.md frontmatter.
 *
 * Uses regex-based extraction — no YAML dependency needed since the
 * frontmatter schema is well-defined and narrow.
 */

export interface SkillFrontmatter {
  name: string;
  description?: string | undefined;
  version?: string | undefined;
  allowedTools?: string[] | undefined;
}

export interface ParsedSkillMd extends SkillFrontmatter {
  body: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatterField(lines: string[], key: string): string | undefined {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}:\\s*(.+)$`));
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function parseFrontmatterMultiline(lines: string[], key: string): string | undefined {
  let capturing = false;
  const parts: string[] = [];
  for (const line of lines) {
    if (line.match(new RegExp(`^${key}:\\s*\\|\\s*$`))) {
      capturing = true;
      continue;
    }
    if (line.match(new RegExp(`^${key}:\\s*(.+)$`)) && !capturing) {
      return line.replace(new RegExp(`^${key}:\\s*`), "").trim();
    }
    if (capturing) {
      if (line.startsWith("  ") || line.startsWith("\t")) {
        parts.push(line.replace(/^[ \t]+/, ""));
      } else {
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function parseAllowedTools(lines: string[]): string[] | undefined {
  // Inline: allowed-tools: [Read, Write, Bash]
  for (const line of lines) {
    const inlineMatch = line.match(/^allowed-tools:\s*\[([^\]]*)\]\s*$/);
    if (inlineMatch?.[1] !== undefined) {
      return inlineMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  // List form:
  // allowed-tools:
  //   - Read
  //   - Write
  let capturing = false;
  const tools: string[] = [];
  for (const line of lines) {
    if (/^allowed-tools:\s*$/.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch?.[1]) {
        tools.push(itemMatch[1].trim());
      } else {
        break;
      }
    }
  }
  return tools.length > 0 ? tools : undefined;
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const match = content.match(FRONTMATTER_RE);
  if (!match?.[1] || !match[2]) {
    return { name: "Untitled", body: content.trim() };
  }

  const frontmatterBlock = match[1];
  const body = match[2].trim();
  const lines = frontmatterBlock.split("\n");

  const name = parseFrontmatterField(lines, "name") ?? "Untitled";
  const description = parseFrontmatterMultiline(lines, "description");
  const version = parseFrontmatterField(lines, "version");
  const allowedTools = parseAllowedTools(lines);

  return { name, description, version, allowedTools, body };
}

export function serializeSkillMd(skill: {
  name: string;
  description?: string | undefined;
  version?: string | undefined;
  allowedTools?: readonly string[] | undefined;
  body: string;
}): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${skill.name}`);
  if (skill.description !== undefined) {
    if (skill.description.includes("\n")) {
      lines.push("description: |");
      for (const descLine of skill.description.split("\n")) {
        lines.push(`  ${descLine}`);
      }
    } else {
      lines.push(`description: ${skill.description}`);
    }
  }
  if (skill.version !== undefined) {
    lines.push(`version: ${skill.version}`);
  }
  if (skill.allowedTools !== undefined && skill.allowedTools.length > 0) {
    lines.push(`allowed-tools: [${skill.allowedTools.join(", ")}]`);
  }
  lines.push("---");
  lines.push("");
  lines.push(skill.body);
  return lines.join("\n");
}
