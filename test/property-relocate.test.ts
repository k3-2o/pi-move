/**
 * Property tests for the /move core: for ANY generated session (header + body),
 * relocateSession preserves the body byte-for-byte, patches cwd in the header,
 * strips parentSession, and leaves the source untouched.
 */
import { afterAll, beforeAll, describe, test } from 'bun:test';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SessionHeader } from '@earendil-works/pi-coding-agent';
import { relocateSession } from '../src/move-session/relocate.ts';

let root: string;
let bucket: string;
let counter: number;

const BODY_CHARS = ['{', '}', '"', ':', ',', 'a', '9', ' ', '\n', '\\', '['];

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-prop-'));
	bucket = path.join(root, 'bucket');
	fs.mkdirSync(bucket);
	counter = 0;
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('relocateSession', () => {
	test('body bytes survive relocation exactly; source untouched', () => {
		fc.assert(
			fc.property(
				fc.record({
					id: fc.uuid(),
					ts: fc.string({ maxLength: 30 }),
					cwd: fc.array(fc.constantFrom('a', 'z', '/', '-'), { maxLength: 20 }).map((cs) => cs.join('')),
					hasParent: fc.boolean(),
				}),
				fc.array(
					fc.array(fc.constantFrom(...BODY_CHARS), { maxLength: 120 }).map((cs) => cs.join('')),
					{ maxLength: 8 },
				),
				fc.array(fc.constantFrom('a', '-', '/'), { maxLength: 15 }).map((cs) => cs.join('')),
				(rec, body, targetDir) => {
					const header: SessionHeader = {
						type: 'session',
						id: rec.id,
						timestamp: rec.ts,
						cwd: rec.cwd,
						...(rec.hasParent ? { parentSession: '/some/origin/session.jsonl' } : {}),
					};
					const source = path.join(bucket, `src-${counter}.jsonl`);
					const text = JSON.stringify(header) + '\n' + body.join('\n');
					fs.writeFileSync(source, text, 'utf8');
					counter++;

					const original = fs.readFileSync(source, 'utf8');
					const headerLen = original.indexOf('\n') + 1; // header terminated by first newline
					const dest = path.join(bucket, `dst-${counter}.jsonl`);
					counter++;

					relocateSession({ sourceFile: source, targetFile: dest, targetCwd: targetDir, header, currentLeafId: null });

					const got = fs.readFileSync(dest, 'utf8');
					const gotHeader = JSON.parse(got.slice(0, got.indexOf('\n')));
					return (
						got.slice(got.indexOf('\n') + 1) === original.slice(headerLen) &&
						gotHeader.cwd === targetDir &&
						!('parentSession' in gotHeader) &&
						fs.readFileSync(source, 'utf8') === original &&
						!fs.existsSync(dest + '.tmp')
					);
				},
			),
			{ numRuns: 40 },
		);
	});

	test('provenance entry is the only addition when a leaf exists', () => {
		fc.assert(
			fc.property(
				fc.uuid(),
				fc.array(
					fc.array(fc.constantFrom(...BODY_CHARS), { maxLength: 40 }).map((cs) => cs.join('')),
					{ maxLength: 4 },
				),
				(id, body) => {
					const header: SessionHeader = { type: 'session', id, timestamp: 't', cwd: '/origin' };
					const source = path.join(bucket, `src-${counter}.jsonl`);
					fs.writeFileSync(source, JSON.stringify(header) + '\n' + body.join('\n'), 'utf8');
					const original = fs.readFileSync(source, 'utf8');
					const headerLen = original.indexOf('\n') + 1;
					const dest = path.join(bucket, `dst-${counter}.jsonl`);
					counter++;

					relocateSession({ sourceFile: source, targetFile: dest, targetCwd: '/dest', header, currentLeafId: 'm2' });

					const got = fs.readFileSync(dest, 'utf8');
					// The marker contains 'pi-move', which the body charset cannot produce.
					const markerIdx = got.lastIndexOf('pi-move');
					const markerStart = got.lastIndexOf('\n', markerIdx - 1) + 1;
					const markerLine = got.slice(markerStart, got.indexOf('\n', markerIdx));
					const marker = JSON.parse(markerLine) as { customType?: string; parentId?: string };
					const bodyPart = got.slice(got.indexOf('\n') + 1, markerStart);
					return (
						marker.customType === 'pi-move' &&
						marker.parentId === 'm2' &&
						(bodyPart === original.slice(headerLen) || bodyPart === original.slice(headerLen) + '\n')
					);
				},
			),
			{ numRuns: 30 },
		);
	});
});
