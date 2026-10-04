/**
 * Property tests for the /cd planner: the classification must be a total,
 * consistent function of the supplied facts (an existing dir is used, a file
 * is rejected, creation is only offered for genuinely missing paths).
 */
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import * as path from 'node:path';
import { candidateFor, parentOf, planTarget, type TargetFacts, type TargetPlan } from '../src/cd/planner.ts';

const CWD = '/home/user/projects/app';
const PATH_CHARS = ['a', 'b', '9', '/', '.', '-', '_'];
const prefixGen2 = fc.array(fc.constantFrom(...PATH_CHARS), { maxLength: 30 }).map((cs) => cs.join(''));

const factsGen = fc.record<TargetFacts>({
	existence: fc.constantFrom('dir', 'not-dir', 'missing'),
	parentIsDirectory: fc.boolean(),
});

describe('planTarget classification', () => {
	test('is total: every (facts) pair yields exactly one known plan', () => {
		fc.assert(
			fc.property(factsGen, fc.string({ maxLength: 30 }), (facts, cand) => {
				const plan = planTarget(cand, facts);
				return ['use', 'create', 'invalid'].includes(plan.kind);
			}),
		);
	});

	test('existing dir -> use, never create; target echoed', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 30 }), (cand) => {
				const plan = planTarget(cand, { existence: 'dir', parentIsDirectory: true });
				return plan.kind === 'use' && plan.target === cand;
			}),
		);
	});

	test('a file on disk is never used or created over', () => {
		fc.assert(
			fc.property(factsGen, fc.string({ maxLength: 30 }), (facts, cand) => {
				if (facts.existence !== 'not-dir') return true;
				const plan = planTarget(cand, facts);
				return (
					plan.kind === 'invalid' &&
					'reason' in plan &&
					(plan as Extract<TargetPlan, { kind: 'invalid' }>).reason === 'not-directory'
				);
			}),
		);
	});

	test('creation requires a missing path AND an existing parent', () => {
		fc.assert(
			fc.property(factsGen, fc.string({ maxLength: 30 }), (facts, cand) => {
				const plan = planTarget(cand, facts);
				if (plan.kind !== 'create') return true;
				return facts.existence === 'missing' && facts.parentIsDirectory;
			}),
		);
	});

	test('missing path handles both parent outcomes consistently', () => {
		fc.assert(
			fc.property(fc.boolean(), fc.string({ maxLength: 30 }), (parentIsDirectory, cand) => {
				const plan = planTarget(cand, { existence: 'missing', parentIsDirectory });
				return parentIsDirectory
					? plan.kind === 'create'
					: plan.kind === 'invalid' && (plan as Extract<TargetPlan, { kind: 'invalid' }>).reason === 'parent-missing';
			}),
		);
	});

	test('candidateFor + parentOf stay in absolute-space', () => {
		fc.assert(
			fc.property(prefixGen2, (input) => {
				const cand = candidateFor(input, CWD);
				return path.isAbsolute(cand) && path.isAbsolute(parentOf(cand));
			}),
		);
	});
});
