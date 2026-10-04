import { fuzzyFilter } from '@earendil-works/pi-tui';
import { probeDirectory, readSubdirsCached, type DirEntry } from '../fs/cache.ts';
import { resolveCandidatePath, splitPrefix } from '../fs/path.ts';

export type { DirEntry } from '../fs/cache.ts';
export { prefetchDirectory } from '../fs/cache.ts';

/** `maxResults` caps the list; ask one extra to detect overflow. */
export function findDirectories(prefix: string, cwd: string, maxResults = 30): DirEntry[] {
	const candidate = resolveCandidatePath(prefix, cwd);
	if (probeDirectory(candidate) === 'dir') {
		return readSubdirsCached(candidate).slice(0, maxResults);
	}
	return search(prefix, cwd, maxResults);
}

function search(prefix: string, cwd: string, maxResults: number): DirEntry[] {
	const { baseDir, query } = splitPrefix(prefix, cwd);
	const pool = readSubdirsCached(baseDir);
	if (!query) return pool.slice(0, maxResults);
	return fuzzyFilter(pool, query, (e) => e.label.replace(/\/$/, '')).slice(0, maxResults);
}
