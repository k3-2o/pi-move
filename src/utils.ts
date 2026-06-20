import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
    return listDirectoryContents(resolved, maxResults);
  }
  const searchDir = getSearchBase(prefix, cwd);
  const query = getQuery(prefix);
  return searchDirectories(searchDir, query, maxResults);
}

function listDirectoryContents(
  dirPath: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: Array<{ value: string; label: string; description?: string }> = [];
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith(".")) continue;
      let isDir: boolean;
      try {
        isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink())
          isDir = fs.statSync(path.join(dirPath, entry.name)).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        const fullPath = path.join(dirPath, entry.name);
        results.push({ value: fullPath, label: entry.name + "/", description: fullPath });
      }
    }
    results.sort((a, b) => a.label.localeCompare(b.label));
    return results;
  } catch {
    return [];
  }
}

function searchDirectories(
  baseDir: string,
  query: string,
  maxResults: number,
): Array<{ value: string; label: string; description?: string }> {
  const results: Array<{ value: string; label: string; description?: string }> = [];
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const lowerQuery = query.toLowerCase();
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      let isDir: boolean;
      try {
        isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink())
          isDir = fs.statSync(path.join(baseDir, entry.name)).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      if (query === "" || entry.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          value: path.join(baseDir, entry.name),
          label: entry.name + "/",
          description: path.join(baseDir, entry.name),
        });
      }
    }
  } catch {
    /* directory not accessible */
  }
  return results;
}

function getSearchBase(prefix: string, cwd: string): string {
  if (prefix === "" || prefix === "~") return cwd;
  const normalized = prefix.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return cwd;
  const basePart = normalized.slice(0, lastSlash + 1);
  if (basePart.startsWith("~")) return path.join(os.homedir(), basePart.slice(1));
  if (path.isAbsolute(basePart)) return basePart;
  return path.resolve(cwd, basePart);
}

function getQuery(prefix: string): string {
  if (prefix === "" || prefix === "~") return "";
  const normalized = prefix.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return normalized;
  return normalized.slice(lastSlash + 1);
}
