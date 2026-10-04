/**
 * Target resolution shell: fs facts → pure planner → prompt → mkdir. Real tmp
 * dirs, a stub context, no pi runtime.
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveTarget, type TargetContext } from '../src/cd/executor.ts';

let root: string;
let cwd: string;

function makeCtx(overrides: Partial<TargetContext> = {}): TargetContext & { notified: Array<[string, string]> } {
	const notified: Array<[string, string]> = [];
	return {
		cwd,
		confirmCreate: async () => true,
		notify: (m, l) => notified.push([m, l]),
		...overrides,
		notified,
	};
}

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-exec-'));
	cwd = path.join(root, 'cwd');
	fs.mkdirSync(cwd);
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveTarget', () => {
	test('existing directory resolves and needs no prompt', async () => {
		fs.mkdirSync(path.join(cwd, 'here'));
		let prompted = false;
		const ctx = makeCtx({ confirmCreate: async () => ((prompted = true), true) });
		const target = await resolveTarget('here', ctx);
		expect(target).toBe(path.join(cwd, 'here'));
		expect(prompted).toBe(false);
	});

	test('missing dir with existing parent prompts and creates', async () => {
		const ctx = makeCtx();
		const target = await resolveTarget('brand-new', ctx);
		expect(target).toBe(path.join(cwd, 'brand-new'));
		expect(fs.statSync(target!).isDirectory()).toBe(true);
	});

	test('declined prompt leaves nothing behind', async () => {
		const ctx = makeCtx({ confirmCreate: async () => false });
		const target = await resolveTarget('nope-nope', ctx);
		expect(target).toBeNull();
		expect(fs.existsSync(path.join(cwd, 'nope-nope'))).toBe(false);
	});

	test('parent missing → error, no create', async () => {
		const ctx = makeCtx();
		const target = await resolveTarget('bogus/deep', ctx);
		expect(target).toBeNull();
		expect(ctx.notified.some(([m, l]) => l === 'error' && m.includes('parent directory does not exist'))).toBe(true);
	});

	test("file target → 'not a directory' error", async () => {
		fs.writeFileSync(path.join(cwd, 'afile'), 'x');
		const ctx = makeCtx();
		const target = await resolveTarget('afile', ctx);
		expect(target).toBeNull();
		expect(ctx.notified.some(([m]) => m.includes('not a directory'))).toBe(true);
	});

	test('absolute path input works', async () => {
		const abs = path.join(root, 'abs-target');
		const ctx = makeCtx();
		const target = await resolveTarget(abs, ctx);
		expect(target).toBe(abs);
		expect(fs.statSync(abs).isDirectory()).toBe(true);
	});
});
