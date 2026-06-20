import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";

/**
 * Resolve a user-provided directory path against the given CWD.
 * Handles ~ expansion, relative paths, . and .. segments.
 *
 * Returns null if the resolved path doesn't exist or isn't a directory.
 */
export function resolveDirectory(input: string, cwd: string): string | null {
  let resolved: string;

  if (input.startsWith("~/") || input === "~") {
    resolved = path.join(os.homedir(), input.slice(1));
  } else if (path.isAbsolute(input)) {
    resolved = input;
  } else {
    resolved = path.resolve(cwd, input);
  }

  resolved = path.normalize(resolved);

  try {
    if (fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    // Does not exist or permission denied
  }

  return null;
}

/**
 * Get a sorted list of directories matching the given prefix.
 *
 * Uses `fd` for fast, recursive, .gitignore-respecting search when available.
 * Falls back to a basic readdirSync scan if fd isn't installed.
 */
export function findDirectories(
  prefix: string,
  cwd: string,
  maxResults = 30,
): Array<{ value: string; label: string; description?: string }> {
  const resolved = resolveDirectory(prefix, cwd);
  if (resolved !== null && fs.statSync(resolved).isDirectory()) {
    // If prefix is already a valid directory, list its contents
    return listDirectoryContents(resolved, maxResults);
  }

  // Fuzzy search from cwd (or from the partial path)
  const searchDir = getSearchBase(prefix, cwd);
  const query = getQuery(prefix);

  return searchDirectories(searchDir, query, maxResults);
}

/**
 * Search for directories using fd (fast) or readdirSync (fallback).
 */
async function searchDirectoriesFd(
  baseDir: string,
  query: string,
  maxResults: number,
): Promise<Array<{ path: string; isDirectory: boolean }>> {
  return new Promise((resolve) => {
    const args = [
      "--base-directory",
      baseDir,
      "--max-results",
      String(maxResults),
      "--type",
      "d",
      "--follow",
      "--hidden",
      "--exclude",
      ".git",
      "--exclude",
      "node_modules",
    ];

    if (query) {
      args.push(query);
    }

    const child = spawn("fd", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.on("error", () => {
      resolve([]);
    });

    child.on("close", (code) => {
      if (code !== 0 || !stdout) {
        resolve([]);
        return;
      }

      const lines = stdout.trim().split("\n").filter(Boolean);
      const results = lines.map((line) => {
        const normalized = line.replace(/\\/g, "/");
        const isDir = normalized.endsWith("/");
        return {
          path: isDir ? normalized.slice(0, -1) : normalized,
          isDirectory: true,
        };
      });

      resolve(results);
    });
  });
}

/**
 * List directory contents (all subdirectories).
 */
function listDirectoryContents(
  dirPath: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: Array<{ value: string; label: string; description?: string }> = [];

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith(".")) continue; // skip hidden

      let isDir: boolean;
      try {
        isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
          isDir = fs.statSync(path.join(dirPath, entry.name)).isDirectory();
        }
      } catch {
        continue;
      }

      if (isDir) {
        const fullPath = path.join(dirPath, entry.name);
        results.push({
          value: fullPath,
          label: entry.name + "/",
          description: fullPath,
        });
      }
    }

    // Alphabetical sort
    results.sort((a, b) => a.label.localeCompare(b.label));
    return results;
  } catch {
    return [];
  }
}

/**
 * Search directories using readdirSync recursively (fallback when fd is unavailable).
 */
function searchDirectories(
  baseDir: string,
  query: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  // First, try fd for speed
  searchDirectoriesFd(baseDir, query, maxResults)
    .then((fdResults) => {
      if (fdResults.length > 0) {
        return fdResults.map((r) => ({
          value: path.resolve(baseDir, r.path),
          label: r.path + "/",
          description: path.resolve(baseDir, r.path),
        }));
      }
      return null;
    })
    .catch(() => null);

  // Synchronous fallback: iterate parent directories
  // This is simpler and immediate
  const results: Array<{ value: string; label: string; description?: string }> = [];

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const lowerQuery = query.toLowerCase();

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      let isDir: boolean;
      try {
        isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
          isDir = fs.statSync(path.join(baseDir, entry.name)).isDirectory();
        }
      } catch {
        continue;
      }

      if (!isDir) continue;

      if (query === "" || entry.name.toLowerCase().includes(lowerQuery)) {
        const fullPath = path.join(baseDir, entry.name);
        results.push({
          value: fullPath,
          label: entry.name + "/",
          description: fullPath,
        });
      }
    }
  } catch {
    // Permission denied or non-existent
  }

  return results;
}

/**
 * Extract the search base directory and the query part from a path prefix.
 * E.g., "~/projects/my" → base: "~/projects", query: "my"
 *         "foo/bar" → base: "cwd/foo", query: "bar"
 */
function getSearchBase(prefix: string, cwd: string): string {
  if (prefix === "" || prefix === "~") {
    return cwd;
  }

  const normalized = prefix.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash === -1) {
    return cwd;
  }

  const basePart = normalized.slice(0, lastSlash + 1);

  if (basePart.startsWith("~")) {
    return path.join(os.homedir(), basePart.slice(1));
  }

  if (path.isAbsolute(basePart)) {
    return basePart;
  }

  return path.resolve(cwd, basePart);
}

function getQuery(prefix: string): string {
  if (prefix === "" || prefix === "~") return "";
  const normalized = prefix.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return normalized;
  return normalized.slice(lastSlash + 1);
}
