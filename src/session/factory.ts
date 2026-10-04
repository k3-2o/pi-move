/** Header must be on disk before switching: pi derives the new session's cwd from it. */
import * as fs from 'node:fs';
import { SessionManager, type SessionHeader } from '@earendil-works/pi-coding-agent';
import { removeFileBestEffort } from '../fs/cache.ts';

export interface CreatedSession {
	file: string;
	header: SessionHeader;
	/** Best-effort removal — for sessions that never became current. */
	abandon(): void;
}

export interface CreateSessionOptions {
	/** Link the new session under its origin for /resume's threaded sort. */
	parentSessionFile?: string;
	/** Tests-only override to stay off the real sessions root. */
	sessionDir?: string;
}

export function createSessionInDir(targetDir: string, options: CreateSessionOptions = {}): CreatedSession {
	const parent = options.parentSessionFile;
	const manager = SessionManager.create(
		targetDir,
		options.sessionDir,
		parent === undefined ? undefined : { parentSession: parent },
	);
	const header = manager.getHeader();
	const file = manager.getSessionFile();
	if (!header || !file) throw new Error('Failed to allocate a new session');
	fs.writeFileSync(file, JSON.stringify(header) + '\n', 'utf-8');
	return { file, header, abandon: () => removeFileBestEffort(file) };
}
