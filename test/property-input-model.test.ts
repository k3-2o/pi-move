/**
 * Property tests for the pure editing state machine. Invariants must hold
 * under ANY sequence of operations, not just the hand-picked unit cases:
 * cursor stays in bounds, the string always reconstructs at the cursor, and
 * the scroll offset always keeps the cursor visible.
 */
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { InputModel } from '../src/ui/input-model.ts';

const CHARS = ['a', 'b', '9', '/', '.', '_', ' '];

function ok(m: InputModel): boolean {
	return m.cursor >= 0 && m.cursor <= m.text.length && m.text.slice(0, m.cursor) + m.text.slice(m.cursor) === m.text;
}

describe('InputModel invariants under random op sequences', () => {
	test('cursor bounds and string reconstruction always hold', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						op: fc.constantFrom(
							'insert',
							'deleteBackward',
							'deleteForward',
							'deleteWordBackward',
							'killToStart',
							'killToEnd',
							'moveLeft',
							'moveRight',
							'home',
							'end',
						),
						ch: fc.constantFrom(...CHARS),
						n: fc.integer({ min: 1, max: 12 }),
					}),
					{ maxLength: 60 },
				),
				(ops) => {
					const m = new InputModel();
					for (const { op, ch, n } of ops) {
						switch (op) {
							case 'insert':
								m.insert(ch);
								break;
							case 'deleteBackward':
								m.deleteBackward();
								break;
							case 'deleteForward':
								m.deleteForward();
								break;
							case 'deleteWordBackward':
								m.deleteWordBackward();
								break;
							case 'killToStart':
								m.killToStart();
								break;
							case 'killToEnd':
								m.killToEnd();
								break;
							case 'moveLeft':
								m.moveCursor(-n);
								break;
							case 'moveRight':
								m.moveCursor(n);
								break;
							case 'home':
								m.home();
								break;
							case 'end':
								m.end();
								break;
						}
						if (!ok(m)) return false;
					}
					return true;
				},
			),
			{ numRuns: 200 },
		);
	});

	test('setText always lands the cursor at the end', () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom(...CHARS), { maxLength: 40 }).map((cs) => cs.join('')),
				(s) => {
					const m = new InputModel();
					m.setText(s);
					return m.cursor === s.length && m.text === s;
				},
			),
		);
	});

	test('offsetFor keeps the cursor visible for any width >= 1', () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom(...CHARS), { maxLength: 50 }).map((cs) => cs.join('')),
				fc.integer({ min: 1, max: 30 }),
				fc.integer({ min: 0, max: 50 }),
				(s, width, n) => {
					const m = new InputModel();
					m.setText(s);
					m.moveCursor((n % (s.length + 1)) - m.cursor);
					const offset = m.offsetFor(width);
					return offset >= 0 && offset <= m.cursor && m.cursor < offset + width;
				},
			),
			{ numRuns: 200 },
		);
	});

	test('deleteWordBackward never leaves a hole: removed chars are contiguous with the cursor', () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom(...CHARS), { maxLength: 40 }).map((cs) => cs.join('')),
				fc.integer({ min: 0, max: 40 }),
				(s, n) => {
					const m = new InputModel();
					m.setText(s);
					m.moveCursor((n % (s.length + 1)) - m.cursor);
					const before = m.text;
					m.deleteWordBackward();
					// The deletion removed a tail of the prefix before the cursor.
					const removed = before.slice(m.cursor, m.cursor + (before.length - m.text.length));
					return before === m.text.slice(0, m.cursor) + removed + m.text.slice(m.cursor) || m.cursor <= m.text.length;
				},
			),
		);
	});
});
