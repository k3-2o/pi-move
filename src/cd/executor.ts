/** Only place with fs facts + ui confirm, so the rest stays pure/testable. */
import * as fs from 'node:fs';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { probeDirectory, type Existence } from '../fs/cache.ts';
import { shortenPath } from '../fs/path.ts';
import { candidateFor, planTarget } from './planner.ts';

export interface TargetContext {
	cwd: string;
	confirmCreate(target: string): Promise<boolean>;
	notify(message: string, level: 'info' | 'warning' | 'error'): void;
}

export function targetContext(ctx: ExtensionCommandContext): TargetContext {
	return {
		cwd: ctx.cwd,
		confirmCreate: (target) =>
			ctx.ui.confirm('Create directory?', `"${shortenPath(target)}" does not exist. Create it?`),
		notify: (message, level) => ctx.ui.notify(message, level),
	};
}

export async function resolveTarget(input: string, ctx: TargetContext): Promise<string | null> {
	const candidate = candidateFor(input, ctx.cwd);
	const existence: Existence = probeDirectory(candidate);
	const plan = planTarget(candidate, { existence });

	switch (plan.kind) {
		case 'use':
			return plan.target;
		case 'invalid':
			ctx.notify(`Target is not a directory: ${plan.target}`, 'error');
			return null;
		case 'create': {
			const confirmed = await ctx.confirmCreate(plan.target);
			if (!confirmed) return null;
			try {
				fs.mkdirSync(plan.target, { recursive: true });
				return plan.target;
			} catch (err) {
				ctx.notify(`Failed to create directory: ${err instanceof Error ? err.message : String(err)}`, 'error');
				return null;
			}
		}
	}
}
