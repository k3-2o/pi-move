/** Pure path arithmetic: tilde/absolute/relative resolution, display, prefix splitting. */
import { describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import { expandTilde, getHome, resolveCandidatePath, shortenPath, splitPrefix } from '../src/fs/path.ts';

const CWD = '/home/user/projects/app';

describe('resolveCandidatePath', () => {
	test('relative resolves against cwd', () => {
		expect(resolveCandidatePath('sub', CWD)).toBe(path.join(CWD, 'sub'));
	});
	test('dotdot resolves through cwd', () => {
		expect(resolveCandidatePath('../other', CWD)).toBe('/home/user/projects/other');
	});
	test('absolute passes through normalized', () => {
		expect(resolveCandidatePath('/tmp/x/../y', CWD)).toBe('/tmp/y');
	});
	test('trailing slash normalizes away', () => {
		expect(resolveCandidatePath('/a/b/', CWD)).toBe('/a/b');
	});
	test('tilde expands to home', () => {
		expect(resolveCandidatePath('~/cfg', CWD)).toBe(path.join(getHome(), 'cfg'));
	});
	test('bare tilde expands to home', () => {
		expect(resolveCandidatePath('~', CWD)).toBe(getHome());
	});
	test('empty input resolves to cwd', () => {
		expect(resolveCandidatePath('', CWD)).toBe(CWD);
	});
	test('whitespace input is trimmed', () => {
		expect(resolveCandidatePath('  sub  ', CWD)).toBe(path.join(CWD, 'sub'));
	});
});

describe('expandTilde', () => {
	test('tilde expands, absolute stays', () => {
		expect(expandTilde('~/x')).toBe(path.join(getHome(), 'x'));
		expect(expandTilde('/x/y')).toBe('/x/y');
		expect(expandTilde('plain')).toBe('plain');
	});
});

describe('shortenPath', () => {
	test('home collapses to ~', () => {
		expect(shortenPath(getHome())).toBe('~');
	});
	test('under home collapses with ~/ prefix', () => {
		expect(shortenPath(path.join(getHome(), 'a', 'b'))).toBe('~/a/b');
	});
	test('equal to home edge (os.homedir) is ~', () => {
		expect(shortenPath(os.homedir())).toBe('~');
	});
	test('outside home unchanged', () => {
		expect(shortenPath('/usr/share/x')).toBe('/usr/share/x');
	});
});

describe('splitPrefix', () => {
	test('empty prefix lists cwd', () => {
		expect(splitPrefix('', CWD)).toEqual({ baseDir: CWD, query: '' });
	});
	test('bare tilde lists cwd (overlay default view)', () => {
		expect(splitPrefix('~', CWD)).toEqual({ baseDir: CWD, query: '' });
	});
	test('plain query searches cwd', () => {
		expect(splitPrefix('sub', CWD)).toEqual({ baseDir: CWD, query: 'sub' });
	});
	test('absolute base', () => {
		expect(splitPrefix('/a/b/pre', CWD)).toEqual({ baseDir: '/a/b', query: 'pre' });
	});
	test('relative base with slash', () => {
		expect(splitPrefix('sub/dir', CWD)).toEqual({ baseDir: path.join(CWD, 'sub'), query: 'dir' });
	});
	test('tilde base', () => {
		expect(splitPrefix('~/cfg/x', CWD)).toEqual({ baseDir: path.join(getHome(), 'cfg'), query: 'x' });
	});
	test('backslashes are treated as separators', () => {
		expect(splitPrefix('sub\\dir', CWD)).toEqual({ baseDir: path.join(CWD, 'sub'), query: 'dir' });
	});
});
