import { CURSOR_MARKER, sliceByColumn, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { DirEntry } from '../fs/cache.ts';
import type { InputModel } from './input-model.ts';

/** Structural Theme subset — tests pass a fake. */
export interface ThemeLike {
	fg(color: string, s: string): string;
	bg(color: string, s: string): string;
}

export function boxTop(th: ThemeLike, innerW: number, title: string): string {
	const border = (s: string) => th.fg('border', s);
	let t = ` ${title} `;
	let titleW = visibleWidth(t);
	// Narrow terminals: truncate the title so the border still closes.
	const maxTitleW = innerW - 2;
	if (titleW > maxTitleW) {
		t = truncateToWidth(t, Math.max(1, maxTitleW), '...', true);
		titleW = visibleWidth(t);
	}
	// Title is plain in this repo (no wide glyphs), visibleWidth == drawn width.
	let leftDash = Math.max(1, Math.floor((innerW - titleW) / 2));
	let rightDash = innerW - titleW - leftDash;
	if (rightDash < 1) {
		// Degenerate widths: fall back to left-aligned so the border still closes.
		leftDash = 1;
		rightDash = Math.max(1, innerW - titleW - leftDash);
	}
	return border('╭') + border('─'.repeat(leftDash)) + th.fg('accent', t) + border('─'.repeat(rightDash)) + border('╮');
}

export function boxBottom(th: ThemeLike, innerW: number): string {
	const border = (s: string) => th.fg('border', s);
	return border(`╰${'─'.repeat(innerW)}╯`);
}

export function cell(th: ThemeLike, inner: string): string {
	const border = (s: string) => th.fg('border', s);
	return border('│') + inner + border('│');
}

export function blank(th: ThemeLike, innerW: number): string {
	return cell(th, ' '.repeat(innerW));
}

export function messageRow(th: ThemeLike, styled: string, innerW: number): string {
	return cell(th, truncateToWidth(` ${styled}`, innerW, '', true));
}

export function inputRow(th: ThemeLike, innerW: number, model: InputModel, focused: boolean): string {
	const prompt = th.fg('accent', '  Path: ');
	const promptW = visibleWidth(prompt);
	const availW = innerW - promptW;
	// Degenerate widths: if the prompt alone fills the row, clip it and stop.
	if (availW <= 0) return truncateToWidth(prompt, innerW, '', true);

	const offset = model.offsetFor(availW);

	const marker = focused ? CURSOR_MARKER : '';
	const cursorChar = model.cursor < model.text.length ? (model.text[model.cursor] ?? ' ') : ' ';

	let core: string;
	if (model.text.length === 0) {
		const placeholder = th.fg('dim', 'Type a directory path…');
		core = `${marker}\x1b[7m${cursorChar}\x1b[27m${placeholder}`;
	} else {
		const before = model.text.slice(0, model.cursor);
		const after = model.text.slice(model.cursor + 1);
		core = `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
	}

	const field = sliceByColumn(core, offset, availW);
	const fieldW = visibleWidth(field);
	const padded = field + (fieldW < availW ? ' '.repeat(availW - fieldW) : '');
	return prompt + padded;
}

export function resultRow(th: ThemeLike, innerW: number, item: DirEntry, isSelected: boolean): string {
	const prefix = isSelected ? '❯ ' : '  ';
	const prefixW = 2;
	const labelW = visibleWidth(item.label);
	const gap = 2;
	const descAvail = innerW - prefixW - labelW - gap;

	if (isSelected) {
		// Plain text on selectedBg avoids nested-SGR reset issues.
		let body = `${prefix}${item.label}`;
		if (item.description && descAvail >= 12) {
			body += ' '.repeat(gap) + truncateToWidth(item.description, descAvail, '');
		}
		return th.bg('selectedBg', truncateToWidth(body, innerW, '', true));
	}

	let body = `${prefix}${th.fg('text', item.label)}`;
	if (item.description && descAvail >= 12) {
		body += th.fg('dim', ' '.repeat(gap) + truncateToWidth(item.description, descAvail, ''));
	}
	return truncateToWidth(body, innerW, '', true);
}

export function helpRow(th: ThemeLike, innerW: number, count: string | undefined): string {
	const keys = '↑↓ navigate · Tab complete · Enter select · Esc cancel';
	let content = th.fg('dim', ` ${keys}`);
	if (count) content += th.fg('dim', `  ${count}`);
	content += ' ';
	return truncateToWidth(content, innerW, '', true);
}
