/** Suggestion engine: drill-into-exist vs search, fuzzy ranking, caps. Real tmp dirs. */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findDirectories } from '../src/search/suggest.ts';

let root: string;
let cwd: string;

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-suggest-'));
	cwd = path.join(root, 'cwd');
	fs.mkdirSync(cwd);
	fs.mkdirSync(path.join(cwd, 'aaa'));
	fs.mkdirSync(path.join(cwd, 'abc'));
	fs.mkdirSync(path.join(cwd, 'sub'), { recursive: true });
	fs.mkdirSync(path.join(cwd, 'sub', 'child1'));
	fs.mkdirSync(path.join(cwd, 'sub', 'child2'));
	fs.mkdirSync(path.join(cwd, '.hidden'));
	fs.writeFileSync(path.join(cwd, 'file.txt'), 'x');
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function names(entries: { label: string }[]): string[] {
	return entries.map((e) => e.label);
}

describe('findDirectories', () => {
	test('empty prefix lists sibling dirs only (no files), dotfiles last', () => {
		const result = names(findDirectories('', cwd, 10));
		expect(result).toEqual(['aaa/', 'abc/', 'sub/', '.hidden/']);
	});

	test('existing dir prefix drills into it', () => {
		const result = names(findDirectories(path.join(cwd, 'sub'), cwd, 10));
		expect(result).toEqual(['child1/', 'child2/']);
	});

	test('trailing slash on existing dir drills into it', () => {
		const result = names(findDirectories(path.join(cwd, 'sub') + '/', cwd, 10));
		expect(result).toEqual(['child1/', 'child2/']);
	});

	test('partial name fuzzy-searches cwd', () => {
		const result = names(findDirectories('ab', cwd, 10));
		expect(result).toContain('abc/');
	});

	test('no-match prefix yields nothing (create-hint state)', () => {
		expect(findDirectories('zzz', cwd, 10)).toEqual([]);
	});

	test('maxResults caps the list', () => {
		const result = findDirectories('', cwd, 2);
		expect(result.length).toBeLessThanOrEqual(2);
	});

	test('entries carry absolute value + shortened description', () => {
		const [first] = findDirectories('', cwd, 1);
		expect(first).toBeDefined();
		if (first) {
			expect(path.isAbsolute(first.value)).toBe(true);
			expect(first.description?.endsWith(first.label.slice(0, -1))).toBe(true);
		}
	});
});
