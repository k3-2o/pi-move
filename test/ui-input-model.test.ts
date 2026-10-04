/** Pure editing state machine: cursor, word-delete, kills, scroll math. */
import { describe, expect, test, beforeEach } from 'bun:test';
import { InputModel } from '../src/ui/input-model.ts';

let m: InputModel;
beforeEach(() => {
	m = new InputModel();
});

describe('insert / cursor', () => {
	test('appends at cursor end', () => {
		m.insert('a');
		m.insert('b');
		expect(m.text).toBe('ab');
		expect(m.cursor).toBe(2);
	});
	test('inserts mid-text', () => {
		m.setText('ac');
		m.moveCursor(-1);
		m.insert('b');
		expect(m.text).toBe('abc');
		expect(m.cursor).toBe(2);
	});
});

describe('deletes', () => {
	test('deleteBackward', () => {
		m.setText('ab');
		m.deleteBackward();
		expect(m.text).toBe('a');
		expect(m.cursor).toBe(1);
	});
	test('deleteBackward at start is a no-op', () => {
		m.setText('a');
		m.home();
		m.deleteBackward();
		expect(m.text).toBe('a');
	});
	test('deleteForward', () => {
		m.setText('ab');
		m.home();
		m.deleteForward();
		expect(m.text).toBe('b');
	});
});

describe('deleteWordBackward', () => {
	test('consumes the preceding word but keeps the separator', () => {
		m.setText('one two');
		m.deleteWordBackward();
		expect(m.text).toBe('one ');
		expect(m.cursor).toBe(4);
	});
	test('path segment delete', () => {
		m.setText('/a/b/c');
		m.deleteWordBackward();
		expect(m.text).toBe('/a/b/');
	});
	test('skips separators before the word', () => {
		m.setText('/a/b/c ');
		m.deleteWordBackward();
		expect(m.text).toBe('/a/b/');
	});
	test('at start is a no-op', () => {
		m.setText('ab');
		m.home();
		m.deleteWordBackward();
		expect(m.text).toBe('ab');
	});
	test('mid-word deletes to the start of the line', () => {
		m.setText('abc.def.txt');
		m.moveCursor(-7); // cursor 4, before 'd'
		m.deleteWordBackward();
		expect(m.text).toBe('def.txt');
	});
});

describe('kills', () => {
	test('killToStart keeps the tail from the cursor', () => {
		m.setText('abcd');
		m.moveCursor(-2);
		m.killToStart();
		expect(m.text).toBe('cd');
		expect(m.cursor).toBe(0);
	});
	test('killToEnd keeps the head up to the cursor', () => {
		m.setText('abcd');
		m.moveCursor(-2);
		m.killToEnd();
		expect(m.text).toBe('ab');
	});
});

describe('setText / motion', () => {
	test('setText puts the cursor at the end', () => {
		m.setText('abc');
		expect(m.cursor).toBe(3);
	});
	test('motion clamps', () => {
		m.setText('abc');
		m.moveCursor(10);
		expect(m.cursor).toBe(3);
		m.moveCursor(-10);
		expect(m.cursor).toBe(0);
	});
	test('home and end', () => {
		m.setText('abc');
		m.home();
		expect(m.cursor).toBe(0);
		m.end();
		expect(m.cursor).toBe(3);
	});
});

describe('offsetFor (scroll math)', () => {
	test('short text offsets to zero', () => {
		m.setText('abc');
		expect(m.offsetFor(10)).toBe(0);
	});
	test('cursor beyond the right edge scrolls it into view', () => {
		m.setText('x'.repeat(30));
		m.home();
		m.moveCursor(12);
		expect(m.offsetFor(10)).toBe(3);
	});
	test('offset never exceeds the cursor', () => {
		m.setText('x'.repeat(30));
		m.home();
		m.moveCursor(12);
		m.offsetFor(10); // scrolls to 3
		m.moveCursor(-6); // cursor 6
		expect(m.offsetFor(10)).toBe(3);
	});
	test('cursor at the field end on a long line', () => {
		m.setText('x'.repeat(30));
		expect(m.offsetFor(10)).toBe(21);
	});
	test('stable across repeat renders', () => {
		m.setText('x'.repeat(30));
		expect(m.offsetFor(10)).toBe(21);
		// unchanged view state → identical offset without cursor movement
		expect(m.offsetFor(10)).toBe(21);
	});

	test('offset may end past the left edge check: visible range covers cursor', () => {
		m.setText('x'.repeat(30));
		const offset = m.offsetFor(10);
		expect(m.cursor).toBeGreaterThanOrEqual(offset);
		expect(m.cursor).toBeLessThan(offset + 10);
	});
});
