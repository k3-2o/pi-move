/** Pure path math — no fs, no pi imports. */
import * as os from 'node:os';
import * as path from 'node:path';

let cachedHome: string | undefined;

/** os.homedir() cached once per process — called per rendered row. */
export function getHome(): string {
	return (cachedHome ??= os.homedir());
}

export function expandTilde(input: string): string {
	if (input === '~') return getHome();
	if (input.startsWith('~/')) return path.join(getHome(), input.slice(2));
	return input;
}

export function resolveCandidatePath(input: string, cwd: string): string {
	const expanded = expandTilde(input.trim());
	const resolved = expanded === '' ? cwd : expanded;
	if (path.isAbsolute(resolved)) return stripTrailingSeparator(path.normalize(resolved));
	return path.resolve(cwd, resolved);
}

/** path.normalize keeps a trailing separator; we want a canonical form. */
function stripTrailingSeparator(p: string): string {
	if (p.length <= 1) return p;
	const stripped = p.replace(/[\\/]+$/, '');
	return stripped.length === 0 ? p : stripped;
}

export function shortenPath(full: string): string {
	const home = getHome();
	if (!home) return full;
	if (full === home) return '~';
	if (full.startsWith(home + path.sep)) return '~' + full.slice(home.length);
	return full;
}

export interface PathPrefix {
	baseDir: string;
	query: string;
}

/** `"~"` alone or an empty prefix means "list cwd" (the overlay's default view). */
export function splitPrefix(prefix: string, cwd: string): PathPrefix {
	if (!prefix || prefix === '~') return { baseDir: cwd, query: '' };
	const norm = prefix.replace(/\\/g, '/');
	const idx = norm.lastIndexOf('/');
	if (idx === -1) return { baseDir: cwd, query: prefix };
	return {
		baseDir: resolveCandidatePath(norm.slice(0, idx + 1), cwd),
		query: norm.slice(idx + 1),
	};
}
