/**
 * Destination math for /move, against real pi SessionManager instances with
 * explicit isolated buckets (off the real ~/.pi/agent/sessions root).
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { computeMoveDestination, resolveCollisionFreeFile } from '../src/move-session/destination.ts';

let root: string;
let cwdA: string;
let cwdB: string;
let bucketA: string;
let bucketB: string;

function bucketOf(name: string): string {
	const dir = path.join(root, name);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-dest-'));
	cwdA = path.join(root, 'cwdA');
	cwdB = path.join(root, 'cwdB');
	fs.mkdirSync(cwdA);
	fs.mkdirSync(cwdB);
	bucketA = bucketOf('bucketA');
	bucketB = bucketOf('bucketB');
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function makeSession(cwd: string, bucket: string) {
	const manager = SessionManager.create(cwd, bucket);
	const header = manager.getHeader();
	const file = manager.getSessionFile();
	if (!header || !file) throw new Error('no session allocated');
	return { manager, header, file };
}

describe('computeMoveDestination', () => {
	test('target file lives in the target bucket and keeps the session id', () => {
		const { header, file } = makeSession(cwdA, bucketA);
		const dest = computeMoveDestination(cwdB, file, header.id, bucketB);
		expect(path.dirname(dest.file)).toBe(bucketB);
		expect(path.basename(dest.file)).toContain(header.id);
		expect(dest.noop).toBe(false);
	});

	test('same bucket + same id is a no-op', () => {
		const { header, file } = makeSession(cwdA, bucketA);
		const dest = computeMoveDestination(cwdA, file, header.id, bucketA);
		expect(dest.noop).toBe(true);
	});

	test('cross-bucket move is flagged (not a no-op)', () => {
		const { header, file } = makeSession(cwdA, bucketA);
		const dest = computeMoveDestination(cwdA, file, header.id, bucketB);
		expect(dest.noop).toBe(false);
	});

	test('production path (omitted sessionDir) still yields an absolute file', () => {
		const { header, file } = makeSession(cwdA, bucketA);
		const dest = computeMoveDestination(cwdB, file, header.id);
		expect(path.isAbsolute(dest.file)).toBe(true);
	});
});

describe('resolveCollisionFreeFile', () => {
	test('free name passes through', () => {
		const free = path.join(bucketB, '2026-01-01T00-00-00-000Z_id.jsonl');
		expect(resolveCollisionFreeFile(free)).toBe(free);
	});

	test('occupied name steps to -moved-2 then -moved-3', () => {
		const base = path.join(bucketB, '2026-01-01T00-00-00-000Z_id.jsonl');
		const moved2 = path.join(bucketB, '2026-01-01T00-00-00-000Z_id-moved-2.jsonl');
		const moved3 = path.join(bucketB, '2026-01-01T00-00-00-000Z_id-moved-3.jsonl');
		fs.writeFileSync(base, 'x');
		fs.writeFileSync(moved2, 'x');
		try {
			expect(resolveCollisionFreeFile(base)).toBe(moved3);
		} finally {
			fs.rmSync(base, { force: true });
			fs.rmSync(moved2, { force: true });
		}
	});
});
