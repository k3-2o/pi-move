/** Pi contract: after a committed switchSession the old ctx is stale — post-switch work only runs inside withSession. */
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { createSessionInDir, type CreateSessionOptions } from './factory.ts';
import { registerCreatedSession, unregisterSession } from './cleanup.ts';

export type CdOutcome = 'switched' | 'cancelled' | 'failed';

export function notifyBestEffort(
	ctx: ExtensionCommandContext,
	message: string,
	level: 'info' | 'warning' | 'error',
): void {
	try {
		ctx.ui.notify(message, level);
	} catch {
		/* ctx already stale — the switch committed without us */
	}
}

export async function switchToFreshSession(
	targetDir: string,
	ctx: ExtensionCommandContext,
	options: CreateSessionOptions = {},
	onSwitched?: (freshCtx: ExtensionCommandContext) => void | Promise<void>,
): Promise<CdOutcome> {
	let created;
	try {
		created = createSessionInDir(targetDir, options);
	} catch (err) {
		ctx.ui.notify(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`, 'error');
		return 'failed';
	}
	registerCreatedSession(created.file);
	try {
		const result = await ctx.switchSession(created.file, {
			withSession: async (freshCtx) => {
				try {
					await onSwitched?.(freshCtx);
				} catch {
					/* a post-switch notification must never fail the transition */
				}
			},
		});
		if (result.cancelled) {
			unregisterSession(created.file);
			created.abandon();
			return 'cancelled';
		}
		return 'switched';
	} catch (err) {
		unregisterSession(created.file);
		created.abandon();
		notifyBestEffort(ctx, `Failed to switch: ${err instanceof Error ? err.message : String(err)}`, 'error');
		return 'failed';
	}
}
