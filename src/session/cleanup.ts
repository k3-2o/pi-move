/** Reap session files that never held a conversation; moved sessions carry a pi-move marker. */
import * as fs from 'node:fs';
import type { CustomEntry, ExtensionAPI, SessionEntry } from '@earendil-works/pi-coding-agent';
import { removeFileBestEffort } from '../fs/cache.ts';

interface SessionLike {
	getSessionFile(): string | undefined;
	getEntries(): SessionEntry[];
}

/** True once the session holds a user or assistant message; pi never persists a file without one. */
export function hasRealMessages(sm: Pick<SessionLike, 'getEntries'>): boolean {
	return sm
		.getEntries()
		.some((e) => e.type === 'message' && (e.message.role === 'user' || e.message.role === 'assistant'));
}

function hasMovedMarker(sm: SessionLike): boolean {
	return sm.getEntries().some((e): e is CustomEntry => e.type === 'custom' && e.customType === 'pi-move');
}

export function isDeadSession(sm: SessionLike): boolean {
	const file = sm.getSessionFile();
	if (!file || !fs.existsSync(file)) return false;
	if (hasMovedMarker(sm)) return false;
	return !hasRealMessages(sm);
}

export function registerReaper(pi: ExtensionAPI): void {
	pi.on('session_shutdown', (event, ctx) => {
		// Never reap on reload — the user is coming back.
		if (event.reason === 'reload') return;
		if (!isDeadSession(ctx.sessionManager)) return;
		const file = ctx.sessionManager.getSessionFile();
		if (!file) return;
		removeFileBestEffort(file);
	});
}
