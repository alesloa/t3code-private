import type { Extension } from "@codemirror/state";

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "svg",
  "tiff",
  "tif",
  "avif",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "webm",
  "flac",
  "aac",
  "avi",
  "mov",
  "mkv",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "pdf",
  "exe",
  "dll",
  "so",
  "dylib",
  "wasm",
  "class",
  "jar",
  "pyc",
  "o",
  "a",
  "lib",
  "obj",
  "db",
  "sqlite",
  "sqlite3",
]);

export const LARGE_FILE_MAX_BYTES = 5_242_880; // 5 MB

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "svg",
  "tiff",
  "tif",
  "avif",
]);

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(filePath));
}

export function fileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return "";
  return filePath.slice(dot + 1).toLowerCase();
}

export function isMarkdownFile(filePath: string): boolean {
  const ext = fileExtension(filePath);
  return ext === "md" || ext === "mdx";
}

export function isBinaryExtension(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(filePath));
}

export function isBinaryContent(contents: string): boolean {
  const check = contents.slice(0, 8192);
  return check.includes("\0");
}

export async function resolveEditorLanguage(filePath: string): Promise<Extension> {
  const ext = fileExtension(filePath);
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: ext === "jsx" });
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return (await import("@codemirror/lang-javascript")).javascript({
        jsx: ext === "tsx",
        typescript: true,
      });
    case "json":
    case "jsonc":
      return (await import("@codemirror/lang-json")).json();
    case "css":
    case "scss":
      return (await import("@codemirror/lang-css")).css();
    case "html":
    case "htm":
    case "vue":
    case "svelte":
      return (await import("@codemirror/lang-html")).html();
    case "md":
    case "mdx":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "py":
      return (await import("@codemirror/lang-python")).python();
    default: {
      const { languages } = await import("@codemirror/language-data");
      const lang = languages.find((l) => l.extensions.includes(ext));
      if (lang) return lang.load();
      return [];
    }
  }
}
