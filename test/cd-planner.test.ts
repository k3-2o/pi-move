/** Pure decision rules: reuse / create / reject, from fs facts alone. */
import { describe, expect, test } from 'bun:test';
import { parentOf, planTarget, candidateFor } from '../src/cd/planner.ts';

const CWD = '/home/user/projects/app';

describe('planTarget', () => {
	test('existing directory → use', () => {
		expect(planTarget('/a', { existence: 'dir', parentIsDirectory: true })).toEqual({
			kind: 'use',
			target: '/a',
		});
	});
	test('missing with existing parent → create', () => {
		expect(planTarget('/a/b', { existence: 'missing', parentIsDirectory: true })).toEqual({
			kind: 'create',
			target: '/a/b',
		});
	});
	test('existing file → invalid not-directory', () => {
		expect(planTarget('/a', { existence: 'not-dir', parentIsDirectory: true })).toEqual({
			kind: 'invalid',
			target: '/a',
			reason: 'not-directory',
		});
	});
	test('missing with missing parent → invalid parent-missing', () => {
		expect(planTarget('/a/b', { existence: 'missing', parentIsDirectory: false })).toEqual({
			kind: 'invalid',
			target: '/a/b',
			reason: 'parent-missing',
		});
	});
});

describe('candidateFor / parentOf', () => {
	test('candidate resolves relative input', () => {
		expect(candidateFor('sub', CWD)).toBe('/home/user/projects/app/sub');
	});
	test('candidate resolves absolute input verbatim', () => {
		expect(candidateFor('/x/y', CWD)).toBe('/x/y');
	});
	test('parent of candidate', () => {
		expect(parentOf('/a/b/c')).toBe('/a/b');
	});
});
