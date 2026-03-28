import * as OS from "node:os";
import { join } from "node:path";

export function getSkillsDir(): string {
  return join(OS.homedir(), ".claude", "skills");
}
