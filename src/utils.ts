import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fuzzyFilter } from "@earendil-works/pi-tui";

export interface DirEntry {
  value: string;
  label: string;
  description?: string;
}

// Two-level cache so repeated keystrokes never touch the filesystem.
// Level 1: raw dirents. Level 2: built & sorted DirEntry[] (dirs only).
const cacheTTL = 500;
const direntCache = new Map<string, { time: number; entries: fs.Dirent[] }>();
const subdirCache = new Map<string, { time: number; entries: DirEntry[] }>();

function readDirCached(dir: string): fs.Dirent[] {
  const now = Date.now();
  const cached = direntCache.get(dir);
  if (cached && now - cached.time < cacheTTL) return cached.entries;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    direntCache.set(dir, { time: now, entries });
    return entries;
  } catch {
    return [];
  }
}

/** Read + cache the sorted list of subdirectory entries for a directory. */
function readSubdirsCached(dir: string): DirEntry[] {
  const now = Date.now();
  const cached = subdirCache.get(dir);
  if (cached && now - cached.time < cacheTTL) return cached.entries;

  const subdirs: DirEntry[] = [];
  for (const dirent of readDirCached(dir)) {
    if (dirent.name === "." || dirent.name === "..") continue;
    const entry = direntToEntry(dir, dirent);
    if (entry) subdirs.push(entry);
  }
  sortEntries(subdirs);
  subdirCache.set(dir, { time: now, entries: subdirs });
  return subdirs;
}

export function prefetchDirectory(dir: string): void {
  readDirCached(dir);
}

/** Collapse $HOME to `~` for shorter, friendlier path display. */
export function shortenPath(full: string): string {
  const home = os.homedir();
  if (!home) return full;
  if (full === home) return "~";
  if (full.startsWith(home + path.sep)) return "~" + full.slice(home.length);
  return full;
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

export function findDirectories(prefix: string, cwd: string, maxResults = 30): DirEntry[] {
  // If the input already names an existing directory, drill into it.
  const resolved = resolveDirectory(prefix, cwd);
  if (resolved !== null) {
    return readSubdirsCached(resolved).slice(0, maxResults);
  }
  return search(prefix, cwd, maxResults);
}

/** Convert a dirent into a DirEntry if it is a (real) directory. */
function direntToEntry(baseDir: string, dirent: fs.Dirent): DirEntry | null {
  let isDir: boolean;
  try {
    // isDirectory() on a Dirent uses the stat info already fetched by
    // readdir, so this is cheap. Symlinks need a follow-up stat.
    if (dirent.isSymbolicLink()) {
      isDir = fs.statSync(path.join(baseDir, dirent.name)).isDirectory();
    } else {
      isDir = dirent.isDirectory();
    }
  } catch {
    return null;
  }
  if (!isDir) return null;
  const full = path.join(baseDir, dirent.name);
  return {
    value: full,
    label: dirent.name + "/",
    description: shortenPath(full),
  };
}

function search(prefix: string, cwd: string, maxResults: number): DirEntry[] {
  let baseDir = cwd;
  let query = "";

  if (prefix && prefix !== "~") {
    const norm = prefix.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/");
    if (idx !== -1) {
      const base = norm.slice(0, idx + 1);
      query = norm.slice(idx + 1);
      if (base.startsWith("~")) baseDir = path.join(os.homedir(), base.slice(1));
      else if (path.isAbsolute(base)) baseDir = base;
      else baseDir = path.resolve(cwd, base);
    } else {
      query = prefix;
    }
  }

  // Rank the full set by fuzzy match against the trailing path segment.
  const pool = readSubdirsCached(baseDir);
  if (!query) return pool.slice(0, maxResults);
  return fuzzyFilter(pool, query, (e) => e.label.replace(/\/$/, "")).slice(0, maxResults);
}

/** Alphabetical, with dotfiles sorted after regular entries. */
function sortEntries(entries: DirEntry[]): void {
  entries.sort((a, b) => {
    const aHidden = a.label.startsWith(".");
    const bHidden = b.label.startsWith(".");
    if (aHidden !== bHidden) return aHidden ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}
