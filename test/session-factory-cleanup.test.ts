/**
 * Session creation for /cd and the reaper predicate. Real pi SessionManager
 * with explicit isolated buckets (off the real sessions root).
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { createSessionInDir } from '../src/session/factory.ts';
import { isDeadSession } from '../src/session/cleanup.ts';

let root: string;
let bucket: string;
let dirA: string;
let dirB: string;

function managerFor(file: string): SessionManager {
	return SessionManager.open(file, bucket);
}

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-session-'));
	bucket = path.join(root, 'bucket');
	fs.mkdirSync(bucket);
	dirA = path.join(root, 'dirA');
	dirB = path.join(root, 'dirB');
	fs.mkdirSync(dirA);
	fs.mkdirSync(dirB);
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
	for (const f of fs.readdirSync(bucket)) fs.rmSync(path.join(bucket, f), { force: true });
});

describe('createSessionInDir', () => {
	test('writes the header with the target cwd into the bucket', () => {
		const created = createSessionInDir(dirB, { sessionDir: bucket });
		expect(fs.existsSync(created.file)).toBe(true);
		expect(created.header.cwd).toBe(dirB);
		expect(created.header.type).toBe('session');
		// pi re-loads it cleanly
		const reopened = SessionManager.open(created.file);
		expect(reopened.getCwd()).toBe(dirB);
		expect(reopened.getLeafId()).toBeNull();
	});

	test('parent session link lands in the header', () => {
		const parent = path.join(root, 'parent.jsonl');
		fs.writeFileSync(parent, JSON.stringify({ type: 'session', id: 'p1', timestamp: 't', cwd: dirA }) + '\n');
		const created = createSessionInDir(dirB, { sessionDir: bucket, parentSessionFile: parent });
		const header = JSON.parse(fs.readFileSync(created.file, 'utf8').split('\n')[0] ?? '{}');
		expect(header.parentSession).toBe(parent);
	});

	test('abandon removes the file best-effort (idempotent)', () => {
		const created = createSessionInDir(dirB, { sessionDir: bucket });
		created.abandon();
		expect(fs.existsSync(created.file)).toBe(false);
		created.abandon(); // second call must not throw
	});
});

describe('isDeadSession', () => {
	test('empty session is dead', () => {
		const created = createSessionInDir(dirB, { sessionDir: bucket });
		expect(isDeadSession(managerFor(created.file))).toBe(true);
	});

	test('session that received a message is alive', () => {
		const created = createSessionInDir(dirB, { sessionDir: bucket });
		// Simulate a persisted user message appended to the session file.
		const entry = {
			type: 'message',
			id: 'm1',
			parentId: null,
			timestamp: '2026-01-01T00:00:00.000Z',
			message: { role: 'user', content: 'hi' },
		};
		fs.appendFileSync(created.file, JSON.stringify(entry) + '\n');
		expect(isDeadSession(managerFor(created.file))).toBe(false);
	});

	test('moved session (pi-move marker) is untouchable even when empty', () => {
		const created = createSessionInDir(dirB, { sessionDir: bucket });
		const marker = {
			type: 'custom',
			customType: 'pi-move',
			id: 'mv1',
			parentId: null,
			timestamp: '2026-01-01T00:00:00.000Z',
			data: { from: dirA, to: dirB },
		};
		fs.appendFileSync(created.file, JSON.stringify(marker) + '\n');
		expect(isDeadSession(managerFor(created.file))).toBe(false);
	});

	test('missing file is not dead', () => {
		expect(isDeadSession(managerFor(path.join(bucket, 'nope.jsonl')))).toBe(false);
	});
});
