/**
 * The /move core: header patch, byte-identical body, provenance marker,
 * atomic destination write, source untouched. Real files in temp dirs.
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SessionHeader } from '@earendil-works/pi-coding-agent';
import { relocateSession } from '../src/move-session/relocate.ts';

let root: string;
let sourceFile: string;
let targetFile: string;
let header: SessionHeader;

const BODY_LINES = [
	{
		type: 'message',
		id: 'm1',
		parentId: null,
		timestamp: '2026-01-01T00:00:00.000Z',
		message: { role: 'user', content: 'hello' },
	},
	{
		type: 'message',
		id: 'm2',
		parentId: 'm1',
		timestamp: '2026-01-01T00:00:01.000Z',
		message: { role: 'assistant', content: 'hi' },
	},
];

function writeSource(): string {
	const file = path.join(root, 'bucketA', '2026-01-01T00-00-00-000Z_idaaaaaa.jsonl');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const headerLine = JSON.stringify(header);
	fs.writeFileSync(file, [headerLine, ...BODY_LINES.map((l) => JSON.stringify(l)), ''].join('\n'));
	return file;
}

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-relocate-'));
	fs.mkdirSync(path.join(root, 'bucketB'));
	header = {
		type: 'session',
		version: 3,
		id: 'idaaaaaa',
		timestamp: '2026-01-01T00:00:00.000Z',
		cwd: root + '/origin',
		parentSession: root + '/parent.jsonl',
	};
	targetFile = path.join(root, 'bucketB', '2026-01-02T00-00-00-000Z_idaaaaaa.jsonl');
	sourceFile = writeSource();
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('relocateSession', () => {
	test('moves entries byte-for-byte into the target file', () => {
		const bytesBefore = fs.readFileSync(sourceFile);
		const result = relocateSession({
			sourceFile,
			targetFile,
			targetCwd: root + '/target',
			header,
			currentLeafId: 'm2',
		});
		expect(result.targetFile).toBe(targetFile);

		const moved = fs
			.readFileSync(targetFile, 'utf8')
			.split('\n')
			.filter((l) => l.length > 0);
		const movedHeader = JSON.parse(moved[0]!) as SessionHeader;
		expect(movedHeader.cwd).toBe(root + '/target');
		expect(movedHeader.id).toBe('idaaaaaa');
		expect('parentSession' in movedHeader).toBe(false);

		// The body beyond the header is untouched: every source line appears verbatim.
		const sourceLines = bytesBefore
			.toString('utf8')
			.split('\n')
			.filter((l) => l.length > 0);
		expect(moved.slice(1, 1 + BODY_LINES.length)).toEqual(sourceLines.slice(1));

		// The last line is the provenance marker.
		const tail = JSON.parse(moved.at(-1)!);
		expect(tail.customType).toBe('pi-move');
		expect(tail.parentId).toBe('m2');
		expect(tail.data.to).toBe(root + '/target');
		expect(tail.data.sourceFile).toBe(sourceFile);
	});

	test('source file is never touched', () => {
		const before = fs.readFileSync(sourceFile, 'utf8');
		relocateSession({
			sourceFile,
			targetFile: path.join(root, 'bucketB', 'other.jsonl'),
			targetCwd: root + '/x',
			header,
			currentLeafId: 'm2',
		});
		expect(fs.readFileSync(sourceFile, 'utf8')).toBe(before);
	});

	test('empty current leaf omits the provenance marker', () => {
		const dest = path.join(root, 'bucketB', '2026-01-03T00-00-00-000Z_idaaaaaa.jsonl');
		relocateSession({ sourceFile, targetFile: dest, targetCwd: root + '/y', header, currentLeafId: null });
		const lines = fs
			.readFileSync(dest, 'utf8')
			.split('\n')
			.filter((l) => l.length > 0);
		expect(lines).toHaveLength(1 + BODY_LINES.length);
	});

	test('empty source file is rejected cleanly', () => {
		const empty = path.join(root, 'bucketA', 'empty.jsonl');
		fs.writeFileSync(empty, '');
		expect(() =>
			relocateSession({
				sourceFile: empty,
				targetFile: path.join(root, 'bucketB', 'nope.jsonl'),
				targetCwd: root + '/z',
				header,
				currentLeafId: null,
			}),
		).toThrow(/empty/);
	});

	test('malformed header (no newline in scan) is rejected cleanly', () => {
		const bad = path.join(root, 'bucketA', 'bad.jsonl');
		fs.writeFileSync(bad, `{"type":"session"}`);
		expect(() =>
			relocateSession({
				sourceFile: bad,
				targetFile: path.join(root, 'bucketB', 'also-bad.jsonl'),
				targetCwd: root + '/z',
				header,
				currentLeafId: null,
			}),
		).toThrow(/header/);
	});

	test('write failure leaves no stray tmp file behind', () => {
		const dir = path.join(root, 'bucketRO');
		fs.mkdirSync(dir);
		fs.chmodSync(dir, 0o555); // read+execute only — tmp create must fail
		try {
			expect(() =>
				relocateSession({
					sourceFile,
					targetFile: path.join(dir, 'x.jsonl'),
					targetCwd: root + '/z',
					header,
					currentLeafId: null,
				}),
			).toThrow();
		} finally {
			fs.chmodSync(dir, 0o755);
		}
		expect(fs.readdirSync(dir)).toEqual([]);
	});
});
