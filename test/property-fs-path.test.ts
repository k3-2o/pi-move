/**
 * Property tests for pure path math: resolution is always absolute, and
 * splitPrefix must be the exact inverse of resolveCandidatePath for any
 * slash-shaped prefix (the overlay depends on the two agreeing).
 */
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import * as path from 'node:path';
import { getHome, resolveCandidatePath, shortenPath, splitPrefix } from '../src/fs/path.ts';

const PATH_CHARS = ['a', 'b', '9', '/', '.', '-', '_'];
const CWD = '/home/user/projects/app';

const prefixGen = fc
	.array(fc.constantFrom(...PATH_CHARS), { maxLength: 40 })
	.map((cs) => cs.join(''))
	.filter((s) => s !== '' && s !== '~');

describe('resolveCandidatePath', () => {
	test('always yields an absolute path', () => {
		fc.assert(
			fc.property(prefixGen, fc.integer({ min: 0, max: 5 }), (s, _) => path.isAbsolute(resolveCandidatePath(s, CWD))),
		);
	});

	test('splitPrefix inverts resolveCandidatePath for any slash-shaped prefix', () => {
		fc.assert(
			fc.property(prefixGen, (prefix) => {
				const { baseDir, query } = splitPrefix(prefix, CWD);
				return (
					path.isAbsolute(baseDir) &&
					!query.includes('/') &&
					!query.includes('\\') &&
					path.resolve(baseDir, query) === resolveCandidatePath(prefix, CWD)
				);
			}),
		);
	});
});

describe('shortenPath', () => {
	test('paths under home shorten, never lengthen', () => {
		fc.assert(
			fc.property(fc.array(fc.constantFrom(...PATH_CHARS), { minLength: 1, maxLength: 3 }), (parts) => {
				const full = path.join(getHome(), ...parts, 'file.ts');
				const short = shortenPath(full);
				return short === '~' + full.slice(getHome().length) && short.length <= full.length && short.startsWith('~/');
			}),
		);
	});

	test('paths outside home are unchanged', () => {
		fc.assert(
			fc.property(prefixGen, (s) => {
				// Prefixes rooted outside home (no ~-expansion happened).
				const outside = '/usr/lib/' + s;
				return shortenPath(outside) === outside;
			}),
		);
	});
});
