import { constants, type Dirent } from "node:fs";
import { access, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMimeType } from "./mime.js";

export type DirectoryEntry = {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  size: number;
  modifiedAt: string;
};

export type FileInfo = {
  path: string;
  name: string;
  type: DirectoryEntry["type"];
  size: number;
  modifiedAt: string;
  createdAt: string;
  mimeType: string;
};

export class AccessDeniedError extends Error {
  constructor(filePath: string) {
    super(`Path is outside the configured ALLOWED_DIRECTORIES: ${filePath}`);
    this.name = "AccessDeniedError";
  }
}

function ensureAllowed(realFilePath: string, allowedDirectories: string[]): void {
  const allowed = allowedDirectories.some((directory) => {
    const relative = path.relative(directory, realFilePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });

  if (!allowed) {
    throw new AccessDeniedError(realFilePath);
  }
}

async function resolveExistingPath(filePath: string, allowedDirectories: string[]): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const resolved = await realpath(absolutePath);
  ensureAllowed(resolved, allowedDirectories);
  return resolved;
}

async function resolveWritablePath(filePath: string, allowedDirectories: string[]): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const parent = path.dirname(absolutePath);
  const realParent = await realpath(parent);
  ensureAllowed(realParent, allowedDirectories);
  return path.join(realParent, path.basename(absolutePath));
}

function typeFromStats(stats: Awaited<ReturnType<typeof stat>>): DirectoryEntry["type"] {
  if (stats.isDirectory()) {
    return "directory";
  }
  if (stats.isFile()) {
    return "file";
  }
  if (stats.isSymbolicLink()) {
    return "symlink";
  }
  return "other";
}

export async function listDirectory(
  directoryPath: string,
  allowedDirectories: string[],
): Promise<DirectoryEntry[]> {
  const resolved = await resolveExistingPath(directoryPath, allowedDirectories);
  const entries = await readdir(resolved, { withFileTypes: true });

  const detailedEntries = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(resolved, entry.name);
      const entryStats = await stat(entryPath);

      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory()
          ? "directory"
          : entry.isFile()
            ? "file"
            : entry.isSymbolicLink()
              ? "symlink"
              : "other",
        size: entryStats.size,
        modifiedAt: entryStats.mtime.toISOString(),
      } satisfies DirectoryEntry;
    }),
  );

  return detailedEntries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : b.type === "directory" ? 1 : 0;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function getFileInfo(filePath: string, allowedDirectories: string[]): Promise<FileInfo> {
  const resolved = await resolveExistingPath(filePath, allowedDirectories);
  const fileStats = await stat(resolved);

  return {
    path: resolved,
    name: path.basename(resolved),
    type: typeFromStats(fileStats),
    size: fileStats.size,
    modifiedAt: fileStats.mtime.toISOString(),
    createdAt: fileStats.birthtime.toISOString(),
    mimeType: getMimeType(resolved),
  };
}

export async function readTextFile(
  filePath: string,
  allowedDirectories: string[],
  maxBytes: number,
): Promise<{ text: string; truncated: boolean; size: number; path: string; mimeType: string }> {
  const resolved = await resolveExistingPath(filePath, allowedDirectories);
  const fileStats = await stat(resolved);

  if (!fileStats.isFile()) {
    throw new Error(`Path is not a file: ${resolved}`);
  }

  const file = await readFile(resolved);
  const truncated = file.length > maxBytes;
  return {
    text: file.subarray(0, maxBytes).toString("utf8"),
    truncated,
    size: file.length,
    path: resolved,
    mimeType: getMimeType(resolved),
  };
}

export async function readBinaryFile(
  filePath: string,
  allowedDirectories: string[],
  maxBytes: number,
): Promise<{ data: string; size: number; path: string; mimeType: string }> {
  const resolved = await resolveExistingPath(filePath, allowedDirectories);
  const fileStats = await stat(resolved);

  if (!fileStats.isFile()) {
    throw new Error(`Path is not a file: ${resolved}`);
  }
  if (fileStats.size > maxBytes) {
    throw new Error(`File is too large (${fileStats.size} bytes). Limit is ${maxBytes} bytes.`);
  }

  return {
    data: (await readFile(resolved)).toString("base64"),
    size: fileStats.size,
    path: resolved,
    mimeType: getMimeType(resolved),
  };
}

export async function writeTextFile(
  filePath: string,
  content: string,
  allowedDirectories: string[],
): Promise<FileInfo> {
  const resolved = await resolveWritablePath(filePath, allowedDirectories);
  await writeFile(resolved, content, "utf8");
  return getFileInfo(resolved, allowedDirectories);
}

export async function createDirectory(
  directoryPath: string,
  allowedDirectories: string[],
): Promise<FileInfo> {
  const resolved = await resolveWritablePath(directoryPath, allowedDirectories);
  await mkdir(resolved, { recursive: true });
  return getFileInfo(resolved, allowedDirectories);
}

export async function searchFiles(options: {
  rootPath: string;
  query: string;
  allowedDirectories: string[];
  maxResults: number;
  maxDepth?: number;
}): Promise<FileInfo[]> {
  const root = await resolveExistingPath(options.rootPath, options.allowedDirectories);
  const rootStats = await stat(root);

  if (!rootStats.isDirectory()) {
    throw new Error(`Search root is not a directory: ${root}`);
  }

  const normalizedQuery = options.query.toLowerCase();
  const maxDepth = options.maxDepth ?? 8;
  const results: FileInfo[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (results.length >= options.maxResults || depth > maxDepth) {
      return;
    }

    let entries: Dirent<string>[];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= options.maxResults) {
        return;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (entry.name.toLowerCase().includes(normalizedQuery)) {
        results.push(await getFileInfo(entryPath, options.allowedDirectories));
      }

      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
      }
    }
  }

  await access(root, constants.R_OK);
  await walk(root, 0);
  return results;
}
