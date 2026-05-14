import { config as loadEnv } from "dotenv";
import { realpath } from "node:fs/promises";
import path from "node:path";

loadEnv();

export type AppConfig = {
  host: string;
  port: number;
  authToken?: string;
  allowWrite: boolean;
  maxReadBytes: number;
  maxSearchResults: number;
  allowedDirectories: string[];
};

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function resolveAllowedDirectories(rawValue: string | undefined): Promise<string[]> {
  const entries = (rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.resolve(entry);
      return realpath(absolutePath);
    }),
  );

  return [...new Set(resolved)].sort();
}

export async function loadConfig(): Promise<AppConfig> {
  return {
    host: process.env.HOST || "127.0.0.1",
    port: parsePositiveInteger(process.env.PORT, 8787),
    authToken: process.env.AUTH_TOKEN?.trim() || undefined,
    allowWrite: parseBoolean(process.env.ALLOW_WRITE, false),
    maxReadBytes: parsePositiveInteger(process.env.MAX_READ_BYTES, 1024 * 1024),
    maxSearchResults: parsePositiveInteger(process.env.MAX_SEARCH_RESULTS, 200),
    allowedDirectories: await resolveAllowedDirectories(process.env.ALLOWED_DIRECTORIES),
  };
}
