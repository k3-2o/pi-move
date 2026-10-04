/** /cd — switch to a different directory, starting a fresh session there. */
import type { ExtensionCommandContext, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { shortenPath } from '../fs/path.ts';
import { notifyBestEffort, switchToFreshSession } from '../session/switch.ts';
import { pickTarget } from '../ui/overlay.ts';
import { resolveTarget, targetContext } from './executor.ts';

export function registerCdCommand(pi: ExtensionAPI): void {
	pi.registerCommand('cd', {
		description: 'Switch to a different directory',
		getArgumentCompletions: (_prefix: string): null => {
			return null;
		},
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const rawTarget = await pickTarget(args, ctx, 'Move to directory');
			if (rawTarget === undefined) return;
			await cdTo(rawTarget, ctx, ctx.sessionManager.getSessionFile());
		},
	});
}

/** Also used by /move when it degrades into a plain switch. */
export async function cdTo(
	rawTarget: string,
	ctx: ExtensionCommandContext,
	parentSessionFile: string | undefined,
): Promise<void> {
	const target = await resolveTarget(rawTarget, targetContext(ctx));
	if (target === null) return;
	const outcome = await switchToFreshSession(
		target,
		ctx,
		parentSessionFile ? { parentSessionFile } : undefined,
		async (freshCtx) => {
			freshCtx.ui.notify(`cd → ${shortenPath(target)}`, 'info');
		},
	);
	if (outcome === 'cancelled') {
		notifyBestEffort(ctx, 'cd cancelled', 'info');
	}
}
