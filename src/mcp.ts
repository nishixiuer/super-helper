import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import {
  createDirectory,
  getFileInfo,
  listDirectory,
  readBinaryFile,
  readTextFile,
  searchFiles,
  writeTextFile,
} from "./filesystem.js";
import { isAudioMimeType, isImageMimeType } from "./mime.js";

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

function fileId(filePath: string): string {
  return `super-helper://file/${Buffer.from(filePath, "utf8").toString("base64url")}`;
}

function pathFromFileId(id: string): string {
  if (!id.startsWith("super-helper://file/")) {
    return id;
  }

  return Buffer.from(id.slice("super-helper://file/".length), "base64url").toString("utf8");
}

function requireWriteEnabled(config: AppConfig): void {
  if (!config.allowWrite) {
    throw new Error("Write tools are disabled. Set ALLOW_WRITE=true in .env to enable them.");
  }
}

export function createSuperHelperMcpServer(config: AppConfig): McpServer {
  const server = new McpServer(
    {
      name: "超级本地链接助手",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Use these tools to inspect only the local directories explicitly configured in ALLOWED_DIRECTORIES. Never access paths outside that allowlist.",
    },
  );

  server.registerTool(
    "list_allowed_directories",
    {
      title: "列出已授权目录",
      description: "List the local directories this MCP server is allowed to access.",
      inputSchema: {},
    },
    async () => jsonResult(config.allowedDirectories),
  );

  server.registerTool(
    "list_directory",
    {
      title: "列目录",
      description: "List files and folders in an allowed local directory.",
      inputSchema: {
        path: z.string().describe("Absolute path to an allowed local directory."),
      },
    },
    async ({ path }) => jsonResult(await listDirectory(path, config.allowedDirectories)),
  );

  server.registerTool(
    "get_file_info",
    {
      title: "查看文件信息",
      description: "Get metadata for an allowed local file or directory.",
      inputSchema: {
        path: z.string().describe("Absolute path to an allowed local file or directory."),
      },
    },
    async ({ path }) => jsonResult(await getFileInfo(path, config.allowedDirectories)),
  );

  server.registerTool(
    "read_text_file",
    {
      title: "读取文本文件",
      description: "Read a UTF-8 text file from an allowed local directory.",
      inputSchema: {
        path: z.string().describe("Absolute path to an allowed text file."),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional byte limit. Defaults to MAX_READ_BYTES."),
      },
    },
    async ({ path, maxBytes }) => {
      const file = await readTextFile(path, config.allowedDirectories, maxBytes ?? config.maxReadBytes);
      const header = [
        `Path: ${file.path}`,
        `MIME: ${file.mimeType}`,
        `Size: ${file.size} bytes`,
        `Truncated: ${file.truncated ? "yes" : "no"}`,
      ].join("\n");

      return textResult(`${header}\n\n${file.text}`);
    },
  );

  server.registerTool(
    "read_media_file",
    {
      title: "读取图片或音频",
      description: "Read an image or audio file from an allowed local directory.",
      inputSchema: {
        path: z.string().describe("Absolute path to an allowed image or audio file."),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional byte limit. Defaults to MAX_READ_BYTES."),
      },
    },
    async ({ path, maxBytes }) => {
      const file = await readBinaryFile(path, config.allowedDirectories, maxBytes ?? config.maxReadBytes);

      if (isImageMimeType(file.mimeType)) {
        return {
          content: [
            { type: "text" as const, text: `Path: ${file.path}\nSize: ${file.size} bytes` },
            { type: "image" as const, data: file.data, mimeType: file.mimeType },
          ],
        };
      }

      if (isAudioMimeType(file.mimeType)) {
        return {
          content: [
            { type: "text" as const, text: `Path: ${file.path}\nSize: ${file.size} bytes` },
            { type: "audio" as const, data: file.data, mimeType: file.mimeType },
          ],
        };
      }

      throw new Error(`Unsupported media type: ${file.mimeType}`);
    },
  );

  server.registerTool(
    "search_files",
    {
      title: "搜索本地文件",
      description: "Search allowed local directories by file or folder name.",
      inputSchema: {
        rootPath: z
          .string()
          .optional()
          .describe("Allowed directory to search. If omitted, searches all allowed roots."),
        query: z.string().min(1).describe("Case-insensitive name fragment to search for."),
        maxResults: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
      },
    },
    async ({ rootPath, query, maxResults, maxDepth }) => {
      const roots = rootPath ? [rootPath] : config.allowedDirectories;
      const results = (
        await Promise.all(
          roots.map((root) =>
            searchFiles({
              rootPath: root,
              query,
              allowedDirectories: config.allowedDirectories,
              maxResults: maxResults ?? config.maxSearchResults,
              maxDepth,
            }),
          ),
        )
      )
        .flat()
        .slice(0, maxResults ?? config.maxSearchResults);

      return jsonResult(results);
    },
  );

  server.registerTool(
    "write_text_file",
    {
      title: "写入文本文件",
      description: "Write a UTF-8 text file under an allowed directory. Disabled unless ALLOW_WRITE=true.",
      inputSchema: {
        path: z.string().describe("Absolute path to write under an allowed directory."),
        content: z.string().describe("UTF-8 content to write."),
      },
    },
    async ({ path, content }) => {
      requireWriteEnabled(config);
      return jsonResult(await writeTextFile(path, content, config.allowedDirectories));
    },
  );

  server.registerTool(
    "create_directory",
    {
      title: "创建目录",
      description: "Create a directory under an allowed directory. Disabled unless ALLOW_WRITE=true.",
      inputSchema: {
        path: z.string().describe("Absolute directory path to create under an allowed directory."),
      },
    },
    async ({ path }) => {
      requireWriteEnabled(config);
      return jsonResult(await createDirectory(path, config.allowedDirectories));
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search local files",
      description:
        "Connector-style search tool. Search allowed local directories by file or folder name and return fetchable file ids.",
      inputSchema: {
        query: z.string().min(1),
      },
    },
    async ({ query }) => {
      const results = (
        await Promise.all(
          config.allowedDirectories.map((root) =>
            searchFiles({
              rootPath: root,
              query,
              allowedDirectories: config.allowedDirectories,
              maxResults: config.maxSearchResults,
            }),
          ),
        )
      )
        .flat()
        .slice(0, config.maxSearchResults)
        .map((file) => ({
          id: fileId(file.path),
          title: file.name,
          url: file.path,
          text: `${file.type} · ${file.path} · ${file.size} bytes · modified ${file.modifiedAt}`,
        }));

      return jsonResult({ results });
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch local file",
      description:
        "Connector-style fetch tool. Fetch file metadata and text content by an id returned from search, or by an allowed absolute path.",
      inputSchema: {
        id: z.string().describe("A super-helper://file/... id returned by search, or an allowed absolute path."),
      },
    },
    async ({ id }) => {
      const targetPath = pathFromFileId(id);
      const info = await getFileInfo(targetPath, config.allowedDirectories);

      if (info.type !== "file") {
        return jsonResult({
          id: fileId(info.path),
          title: info.name,
          url: info.path,
          metadata: info,
        });
      }

      const file = await readTextFile(info.path, config.allowedDirectories, config.maxReadBytes);
      return jsonResult({
        id: fileId(info.path),
        title: info.name,
        url: info.path,
        text: file.text,
        metadata: {
          ...info,
          truncated: file.truncated,
        },
      });
    },
  );

  return server;
}
