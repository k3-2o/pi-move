/** Destination math; bucket allocation is pi's own API. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

export interface MoveDestination {
	file: string;
	/** True when the target bucket already holds this session id (no-op). */
	noop: boolean;
}

/** pi re-issues the filename with a fresh timestamp; identity rides on the session id. sessionDir is tests-only. */
export function computeMoveDestination(
	targetDir: string,
	currentFile: string,
	currentId: string,
	sessionDir?: string,
): MoveDestination {
	const manager = SessionManager.create(targetDir, sessionDir, { id: currentId });
	const file = manager.getSessionFile();
	if (!file) throw new Error('Pi failed to allocate a destination session file');
	// Same bucket + same id = already there; path equality is unreliable (pi stamps create-time filenames).
	const sameBucket = path.resolve(path.dirname(file)) === path.resolve(path.dirname(currentFile));
	return { file, noop: sameBucket };
}

/** Never overwrite — step up `<name>-moved-<n>` (same convention as the other pi-move variants). */
export function resolveCollisionFreeFile(destFile: string): string {
	if (!fs.existsSync(destFile)) return destFile;
	const parsed = path.parse(destFile);
	for (let n = 2; n <= 10; n++) {
		const candidate = path.join(parsed.dir, `${parsed.name}-moved-${n}${parsed.ext}`);
		if (!fs.existsSync(candidate)) return candidate;
	}
	throw new Error(`Cannot move session: name exhausted in ${parsed.dir}`);
}
