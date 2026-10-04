/**
 * Full-overlay composition regression: every rendered line must carry the box
 * borders (╭/│/╰ on the left, ╮/│/╯ on the right), in every state — results
 * present, no match, empty, narrow widths. Guards the cell()-wrapping contract
 * that the chopped composition must not lose.
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MoveOverlay, type PickedDirectory } from '../src/ui/overlay.ts';
import type { ThemeLike } from '../src/ui/rows.ts';

const th: ThemeLike = {
	// Real SGR escapes: pi's width math (visibleWidth/truncateToWidth/sliceByColumn)
	// must see exactly what production sees, or the assertions measure the theme.
	fg: (color, s) => `\x1b[38;5;1m${s}\x1b[39m`,
	bg: (color, s) => `\x1b[48;5;1m${s}\x1b[49m`,
};

// eslint-disable-next-line no-control-regex -- unicode box-drawing escapes for the border tests
const LEFT = /[\u256d\u2502\u2570]/; // ╭ │ ╰
// eslint-disable-next-line no-control-regex -- unicode box-drawing escapes for the border tests
const RIGHT = /[\u256e\u2502\u256f]/; // ╮ │ ╯

function strip(s: string): string {
	return (
		s
			// eslint-disable-next-line no-control-regex -- stripping ANSI codes in test output
			.replace(/\x1b\[[0-9;]*m/g, '')
			// eslint-disable-next-line no-control-regex -- stripping fake-theme tag opens
			.replace(/\x1b\[[a-z/][^\]]*\]/g, '')
			// eslint-disable-next-line no-control-regex -- stripping the OSC cursor marker
			.replace(/\x1b_[^\x07]*\x07/g, '')
			// eslint-disable-next-line no-control-regex -- stray ESC leaders
			.replace(/\x1b/g, '')
	);
}

function assertBordered(lines: string[], width: number): void {
	expect(lines.length).toBeGreaterThan(0);
	for (const [i, line] of lines.entries()) {
		expect(line, `line ${i} left edge`).toMatch(LEFT);
		expect(line, `line ${i} right edge`).toMatch(RIGHT);
		expect(strip(line).length, `line ${i} total width`).toBeLessThanOrEqual(width);
	}
}

let root: string;
let cwd: string;

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-overlay-'));
	cwd = path.join(root, 'cwd');
	fs.mkdirSync(cwd);
	fs.mkdirSync(path.join(cwd, 'alpha'));
	fs.mkdirSync(path.join(cwd, 'beta'));
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('MoveOverlay rendering', () => {
	test('results state keeps side borders on every row', () => {
		const overlay = new MoveOverlay(th, cwd, () => {});
		const lines = overlay.render(72);
		assertBordered(lines, 72);
		expect(strip(lines.join('\n'))).toContain('alpha/');
	});

	test('empty-input state (no subdirectories) keeps borders', () => {
		const empty = path.join(root, 'empty');
		fs.mkdirSync(empty);
		const overlay = new MoveOverlay(th, empty, () => {});
		const lines = overlay.render(44);
		assertBordered(lines, 44);
		expect(strip(lines.join('\n'))).toContain('No subdirectories');
	});

	test('no-match state keeps borders and shows the create hint', () => {
		const overlay = new MoveOverlay(th, cwd, () => {});
		overlay.handleInput('z');
		const lines = overlay.render(72);
		assertBordered(lines, 72);
		expect(strip(lines.join('\n'))).toContain('No matching directories');
		expect(strip(lines.join('\n'))).toContain('Press Enter to create "z"');
	});

	test('narrow terminal stays fully bordered', () => {
		const overlay = new MoveOverlay(th, cwd, () => {});
		for (const width of [20, 12, 6]) {
			assertBordered(overlay.render(width), width);
		}
	});

	test('selection completes with the selected directory', () => {
		let picked: PickedDirectory | undefined;
		const overlay = new MoveOverlay(th, cwd, (r) => (picked = r));
		// Enter arrives as CR in the terminal stream.
		overlay.handleInput('\r');
		expect(picked).toBeDefined();
		// Default selection is the first alphabetical entry of cwd.
		expect(picked?.directory).toBe(path.join(cwd, 'alpha'));
	});
});
