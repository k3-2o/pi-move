/**
 * Render helpers: border closure and centering at every width, selection
 * markers, truncation. A fake ThemeLike keeps assertions free of ANSI.
 */
import { describe, expect, test } from 'bun:test';
import { CURSOR_MARKER } from '@earendil-works/pi-tui';
import type { DirEntry } from '../src/fs/cache.ts';
import { InputModel } from '../src/ui/input-model.ts';
import * as rows from '../src/ui/rows.ts';
import type { ThemeLike } from '../src/ui/rows.ts';

function makeTheme(): ThemeLike {
	return {
		fg: (color, s) => `\x1b[fg:${color}]${s}\x1b[/]`,
		bg: (color, s) => `\x1b[bg:${color}]${s}\x1b[/]`,
	};
}

const th = makeTheme();

function flat(s: string): string {
	// eslint-disable-next-line no-control-regex -- stripping ANSI codes in test output
	return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[a-z/][^\]]*\]/g, '');
}

describe('boxTop', () => {
	test('closes the border with a centered title', () => {
		const line = flat(boxTop(30, 'Move to directory'));
		expect(line.startsWith('╭')).toBe(true);
		expect(line.endsWith('╮')).toBe(true);
		expect(line.length).toBe(32);
		expect(line).toContain('Move to directory');
	});
	test('centering: title sits between equal-ish dash runs and the border closes', () => {
		// innerW 30, title 19 chars → 5 left / 6 right dashes
		expect(flat(boxTop(30, 'Move to directory'))).toBe('╭───── Move to directory ──────╮');
		expect(flat(boxTop(31, 'Move to directory'))).toBe('╭────── Move to directory ──────╮');
	});
});

describe('boxTop at degenerate widths', () => {
	test('tiny width truncates the title but always closes', () => {
		for (const innerW of [3, 4, 5, 6, 7, 8]) {
			const line = flat(boxTop(innerW, 'Move to directory'));
			expect(line.startsWith('╭')).toBe(true);
			expect(line.endsWith('╮')).toBe(true);
			expect(line.length).toBe(innerW + 2);
		}
	});
});

describe('cell / blank', () => {
	test('cell wraps content in vertical borders', () => {
		expect(flat(cell('x'))).toBe('│x│');
	});
	test('blank pads to the inner width', () => {
		expect(flat(blank(5))).toBe('│     │');
	});
});

describe('inputRow', () => {
	test('focused empty input places the cursor marker before the placeholder', () => {
		const m = new InputModel();
		const line = inputRow(30, m, true);
		expect(line.includes(CURSOR_MARKER)).toBe(true);
	});
	test('unfocused empty input shows the full placeholder', () => {
		const m = new InputModel();
		expect(flat(inputRow(80, m, false))).toContain('Type a directory path…');
	});
	test('typed text renders with cursor marker at the caret', () => {
		const m = new InputModel();
		m.setText('/home/user/proj');
		const line = inputRow(30, m, true);
		expect(line.includes(CURSOR_MARKER)).toBe(true);
	});
	test('unfocused renders no cursor marker', () => {
		const m = new InputModel();
		m.setText('abc');
		expect(inputRow(30, m, false)).not.toContain(CURSOR_MARKER);
	});
});

describe('resultRow', () => {
	const item: DirEntry = { value: '/a/b/', label: 'b/', description: '~/a/b' };

	test('selected row carries the pointer marker', () => {
		expect(flat(resultRow(40, item, true))).toContain('❯');
	});
	test('unselected row carries padding in the pointer column', () => {
		expect(flat(resultRow(40, item, false))).toContain('  b/');
	});
	test('fits inside the inner width', () => {
		for (const innerW of [12, 20, 40]) {
			expect(flat(resultRow(innerW, item, true)).length).toBeLessThanOrEqual(innerW);
		}
	});
	test('hides the description when the row is too narrow', () => {
		const row = flat(resultRow(8, item, false));
		expect(row).not.toContain('~/a/b');
	});
});

describe('helpRow', () => {
	test('shows keys and the optional counter', () => {
		expect(flat(helpRow(70, '3/15'))).toContain('Tab complete');
		expect(flat(helpRow(70, '3/15'))).toContain('3/15');
	});
	test('without a counter omits it', () => {
		expect(flat(helpRow(50, undefined))).not.toContain('3/15');
	});
	test('fits inside the width', () => {
		expect(flat(helpRow(20, '99/100')).length).toBeLessThanOrEqual(20);
	});
});

describe('messageRow', () => {
	test('styled content is bounded by the width', () => {
		expect(flat(messageRow('x'.repeat(100), 20)).length).toBeLessThanOrEqual(20 + 2);
	});
});

// Local aliases so the test reads like the API
function boxTop(innerW: number, title: string): string {
	return rows.boxTop(th, innerW, title);
}
function cell(inner: string): string {
	return rows.cell(th, inner);
}
function blank(innerW: number): string {
	return rows.blank(th, innerW);
}
function inputRow(innerW: number, model: InputModel, focused: boolean): string {
	return rows.inputRow(th, innerW, model, focused);
}
function resultRow(innerW: number, item: DirEntry, selected: boolean): string {
	return rows.resultRow(th, innerW, item, selected);
}
function helpRow(innerW: number, count: string | undefined): string {
	return rows.helpRow(th, innerW, count);
}
function messageRow(styled: string, innerW: number): string {
	return rows.messageRow(th, styled, innerW);
}
