/**
 * Toolchain self-check: oxlint + oxfmt must run from node_modules/.bin (pinned
 * devDeps, per the pi-shake "cut the tether" resolution) and the old vendor
 * copy must be gone.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

function runTool(bin: string, args: string[]): { status: number | null; stdout: string } {
	const r = spawnSync('node', [bin, ...args], { encoding: 'utf8' });
	return { status: r.status, stdout: r.stdout };
}

describe('pinned toolchain (node_modules/.bin)', () => {
	test('oxfmt runs (0.71.0)', () => {
		const r = runTool('node_modules/.bin/oxfmt', ['--version']);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain('0.71.0');
	});

	test('oxlint runs (1.86.0)', () => {
		const r = runTool('node_modules/.bin/oxlint', ['--version']);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain('1.86.0');
	});

	test('no vendor copy remains', () => {
		expect(fs.existsSync('vendor')).toBe(false);
	});

	test('typescript is the pinned devDep (7.0.2)', () => {
		const r = runTool('node_modules/.bin/tsc', ['--version']);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain('7.0.2');
	});
});
