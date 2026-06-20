import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Simple directory listing cache with TTL
const cacheTTL = 500;
const dirCache = new Map<string, { time: number; entries: string[] }>();

function readDirCached(dir: string): string[] {
  const now = Date.now();
  const cached = dirCache.get(dir);
  if (cached && now - cached.time < cacheTTL) return cached.entries;
  try {
    const entries = fs.readdirSync(dir);
    dirCache.set(dir, { time: now, entries });
    return entries;
  } catch {
    return [];
  }
}

export function prefetchDirectory(dir: string): void {
  readDirCached(dir);
}

export function resolveDirectory(input: string, cwd: string): string | null {
  let resolved = input;
  if (input.startsWith("~/") || input === "~") {
    resolved = path.join(os.homedir(), input.slice(1));
  } else if (!path.isAbsolute(input)) {
    resolved = path.resolve(cwd, input);
  }
  resolved = path.normalize(resolved);
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

export function findDirectories(
  prefix: string,
  cwd: string,
  maxResults = 30,
): Array<{ value: string; label: string; description?: string }> {
  const resolved = resolveDirectory(prefix, cwd);
  if (resolved !== null && fs.statSync(resolved).isDirectory()) {
    return listContents(resolved, maxResults);
  }
  return search(prefix, cwd, maxResults);
}

function listContents(
  dirPath: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  const results: Array<{ value: string; label: string; description?: string }> = [];
  try {
    const names = readDirCached(dirPath);
    for (const name of names) {
      if (results.length >= maxResults) break;
      if (name.startsWith(".")) continue;
      let isDir: boolean;
      try {
        const full = path.join(dirPath, name);
        const stat = fs.statSync(full);
        isDir = stat.isDirectory();
        if (!isDir && stat.isSymbolicLink()) isDir = fs.statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        const full = path.join(dirPath, name);
        results.push({ value: full, label: name + "/", description: full });
      }
    }
    results.sort((a, b) => a.label.localeCompare(b.label));
  } catch { /* dir not accessible */ }
  return results;
}

function search(
  prefix: string,
  cwd: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  const results: Array<{ value: string; label: string; description?: string }> = [];
  let baseDir = cwd;
  let query = prefix;

  if (prefix && prefix !== "~") {
    const norm = prefix.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/");
    if (idx !== -1) {
      const base = norm.slice(0, idx + 1);
      query = norm.slice(idx + 1);
      if (base.startsWith("~")) baseDir = path.join(os.homedir(), base.slice(1));
      else if (path.isAbsolute(base)) baseDir = base;
      else baseDir = path.resolve(cwd, base);
    }
  }

  const lower = query.toLowerCase();
  try {
    const names = readDirCached(baseDir);
    for (const name of names) {
      if (results.length >= maxResults) break;
      let isDir: boolean;
      try {
        const full = path.join(baseDir, name);
        const stat = fs.statSync(full);
        isDir = stat.isDirectory();
        if (!isDir && stat.isSymbolicLink()) isDir = fs.statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      if (!query || name.toLowerCase().includes(lower)) {
        results.push({
          value: path.join(baseDir, name),
          label: name + "/",
          description: path.join(baseDir, name),
        });
      }
    }
  } catch { /* dir not accessible */ }
  return results;
}
