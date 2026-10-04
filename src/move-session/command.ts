/** /move: relocate session + switch in-process; pi rebuilds the runtime from the new header cwd, so project config loads. */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveCollisionFreeFile, computeMoveDestination } from './destination.ts';
import { relocateSession } from './relocate.ts';
import { cdTo } from '../cd/command.ts';
import { resolveTarget, targetContext } from '../cd/executor.ts';
import { removeFileBestEffort } from '../fs/cache.ts';
import { shortenPath } from '../fs/path.ts';
import { notifyBestEffort } from '../session/switch.ts';
import { pickTarget } from '../ui/overlay.ts';

export function registerMoveCommand(pi: ExtensionAPI): void {
	pi.registerCommand('move', {
		description: 'Move this session to another directory — relocates the session file and reloads project config there',
		getArgumentCompletions: (_prefix: string): null => {
			return null;
		},
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const sm = ctx.sessionManager;
			const sourceFile = sm.getSessionFile();
			const header = sm.getHeader();
			if (!sourceFile || !header) {
				ctx.ui.notify('No persistent session to move', 'error');
				return;
			}

			const rawTarget = await pickTarget(args, ctx, 'Move session to');
			if (rawTarget === undefined) return;

			// Nothing to move — degrade into a plain /cd.
			if (sm.getLeafId() === null) {
				await cdTo(rawTarget, ctx, sourceFile);
				return;
			}

			const target = await resolveTarget(rawTarget, targetContext(ctx));
			if (target === null) return;

			const dest = computeMoveDestination(target, sourceFile, header.id);
			if (dest.noop) {
				ctx.ui.notify(`Session already in ${shortenPath(target)}`, 'info');
				return;
			}
			const destFile = resolveCollisionFreeFile(dest.file);
			if (destFile !== dest.file) {
				ctx.ui.notify(
					`A session with this name already exists there — saving as ${destFile.split(/[\\/]/).pop()}`,
					'warning',
				);
			}

			ctx.ui.notify(`Relocating session to ${shortenPath(target)}…`, 'info');
			try {
				relocateSession({ sourceFile, targetFile: destFile, targetCwd: target, header, currentLeafId: sm.getLeafId() });
			} catch (err) {
				ctx.ui.notify(`Move failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
				return;
			}

			let switchResult;
			try {
				switchResult = await ctx.switchSession(destFile, {
					withSession: async (freshCtx) => {
						// The destination is live — the source is superseded.
						removeFileBestEffort(sourceFile);
						freshCtx.ui.notify(`Moved session to ${shortenPath(target)}`, 'info');
					},
				});
			} catch (err) {
				removeFileBestEffort(destFile);
				notifyBestEffort(ctx, `Move failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
				return;
			}
			if (switchResult.cancelled) {
				removeFileBestEffort(destFile);
				notifyBestEffort(ctx, 'Move cancelled', 'info');
			}
		},
	});
}
