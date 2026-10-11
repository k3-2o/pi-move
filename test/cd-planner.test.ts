/** Pure decision rules: reuse / create / reject, from fs facts alone. */
import { describe, expect, test } from 'bun:test';
import { candidateFor, parentOf, planTarget } from '../src/cd/planner.ts';

const CWD = '/home/user/projects/app';

describe('planTarget', () => {
	test('existing directory → use', () => {
		expect(planTarget('/a', { existence: 'dir' })).toEqual({
			kind: 'use',
			target: '/a',
		});
	});
	test('missing with existing parent → create', () => {
		expect(planTarget('/a/b', { existence: 'missing' })).toEqual({
			kind: 'create',
			target: '/a/b',
		});
	});
	test('existing file → invalid not-directory', () => {
		expect(planTarget('/a', { existence: 'not-dir' })).toEqual({
			kind: 'invalid',
			target: '/a',
			reason: 'not-directory',
		});
	});
	test('missing with missing parent → still create (mkdir -p)', () => {
		expect(planTarget('/a/b', { existence: 'missing' })).toEqual({
			kind: 'create',
			target: '/a/b',
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
