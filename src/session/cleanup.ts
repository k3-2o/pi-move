/** Reap only cd-created sessions that never held a conversation; moved/resumed/foreign are untouchable. */
import type { ExtensionAPI, SessionEntry } from '@earendil-works/pi-coding-agent';
import { removeFileBestEffort } from '../fs/cache.ts';

interface SessionLike {
	getSessionFile(): string | undefined;
	getLeafId(): string | null;
	getEntries(): SessionEntry[];
}

/** Session files this runtime created via /cd that may still be empty. */
const createdSessions = new Set<string>();

export function registerCreatedSession(file: string): void {
	createdSessions.add(file);
}

export function unregisterSession(file: string): void {
	createdSessions.delete(file);
}

/** O(1) in the common case; the message scan stays authoritative. */
export function isDeadSession(sm: SessionLike): boolean {
	const file = sm.getSessionFile();
	if (!file || !createdSessions.has(file)) return false;
	if (sm.getLeafId() === null) return true;
	const hasRealMessages = sm
		.getEntries()
		.some((e) => e.type === 'message' && (e.message.role === 'user' || e.message.role === 'assistant'));
	return !hasRealMessages;
}

export function registerReaper(pi: ExtensionAPI): void {
	pi.on('session_shutdown', (event, ctx) => {
		// Never reap on reload — the user is coming back.
		if (event.reason === 'reload') return;
		if (!isDeadSession(ctx.sessionManager)) return;
		const file = ctx.sessionManager.getSessionFile();
		if (!file) return;
		unregisterSession(file);
		removeFileBestEffort(file);
	});
}
