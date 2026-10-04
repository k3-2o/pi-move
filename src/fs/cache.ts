/** The only module allowed to readdir/stat for listings — keeps caching sound. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shortenPath } from './path.ts';

export interface DirEntry {
	value: string;
	label: string;
	description?: string;
}

// Two-level dirent cache so repeated keystrokes never touch the fs; FIFO-evict at 64 dirs.
const cacheTTL = 500;
const maxCachedDirs = 64;
const direntCache = new Map<string, { time: number; entries: fs.Dirent[] }>();
const subdirCache = new Map<string, { time: number; entries: DirEntry[] }>();

function evictOverCapacity<K, V>(map: Map<K, V>): void {
	while (map.size > maxCachedDirs) {
		const oldest = map.keys().next().value;
		if (oldest === undefined) break;
		map.delete(oldest);
	}
}

function listDirentsCached(dir: string): fs.Dirent[] {
	const now = Date.now();
	const cached = direntCache.get(dir);
	if (cached && now - cached.time < cacheTTL) return cached.entries;
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		direntCache.set(dir, { time: now, entries });
		evictOverCapacity(direntCache);
		return entries;
	} catch {
		return [];
	}
}

export function readSubdirsCached(dir: string): DirEntry[] {
	const now = Date.now();
	const cached = subdirCache.get(dir);
	if (cached && now - cached.time < cacheTTL) return cached.entries;

	const subdirs: DirEntry[] = [];
	for (const dirent of listDirentsCached(dir)) {
		if (dirent.name === '.' || dirent.name === '..') continue;
		const entry = direntToEntry(dir, dirent);
		if (entry) subdirs.push(entry);
	}
	sortEntries(subdirs);
	subdirCache.set(dir, { time: now, entries: subdirs });
	evictOverCapacity(subdirCache);
	return subdirs;
}

export function prefetchDirectory(dir: string): void {
	listDirentsCached(dir);
}

export function removeFileBestEffort(file: string): void {
	try {
		fs.unlinkSync(file);
	} catch {
		/* already gone */
	}
}

export type Existence = 'dir' | 'not-dir' | 'missing';

/** Prefer cached dirents; stat only for symlinks and unlisted parents — zero syscalls on the keystroke path. */
export function probeDirectory(dir: string): Existence {
	const parent = path.dirname(dir);
	const base = path.basename(dir);
	const parentCache = direntCache.get(parent);
	if (parentCache) {
		const entry = parentCache.entries.find((e) => e.name === base);
		if (entry) {
			if (entry.isSymbolicLink()) {
				try {
					return fs.statSync(dir).isDirectory() ? 'dir' : 'not-dir';
				} catch {
					return 'missing';
				}
			}
			return entry.isDirectory() ? 'dir' : 'not-dir';
		}
		if (Date.now() - parentCache.time < cacheTTL) return 'missing';
	}
	try {
		return fs.statSync(dir).isDirectory() ? 'dir' : 'not-dir';
	} catch {
		return 'missing';
	}
}

function direntToEntry(baseDir: string, dirent: fs.Dirent): DirEntry | null {
	let isDir: boolean;
	try {
		// Dirent.isDirectory() is stat-free; only symlinks need a follow-up stat.
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
		label: dirent.name + '/',
		description: shortenPath(full),
	};
}

function sortEntries(entries: DirEntry[]): void {
	entries.sort((a, b) => {
		const aHidden = a.label.startsWith('.');
		const bHidden = b.label.startsWith('.');
		if (aHidden !== bHidden) return aHidden ? 1 : -1;
		return a.label.localeCompare(b.label);
	});
}
