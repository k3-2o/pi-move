/** Pure target decision rules — no I/O; callers supply fs facts. */
import * as path from 'node:path';
import type { Existence } from '../fs/cache.ts';
import { resolveCandidatePath } from '../fs/path.ts';

export type TargetPlan =
	| { kind: 'use'; target: string }
	| { kind: 'create'; target: string }
	| { kind: 'invalid'; target: string; reason: 'not-directory' | 'parent-missing' };

export interface TargetFacts {
	existence: Existence;
	parentIsDirectory: boolean;
}

/** Classify a candidate path over caller-supplied fs facts. */
export function planTarget(candidate: string, facts: TargetFacts): TargetPlan {
	if (facts.existence === 'dir') return { kind: 'use', target: candidate };
	if (facts.existence === 'not-dir') return { kind: 'invalid', target: candidate, reason: 'not-directory' };
	if (!facts.parentIsDirectory) return { kind: 'invalid', target: candidate, reason: 'parent-missing' };
	return { kind: 'create', target: candidate };
}

export function candidateFor(input: string, cwd: string): string {
	return resolveCandidatePath(input, cwd);
}

export function parentOf(candidate: string): string {
	return path.dirname(candidate);
}
