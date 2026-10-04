/** Thin Focusable root — state in InputModel, rendering in rows.ts. Shared by /cd and /move. */
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { type Focusable, matchesKey } from '@earendil-works/pi-tui';
import type { DirEntry } from '../search/suggest.ts';
import { findDirectories, prefetchDirectory } from '../search/suggest.ts';
import { InputModel } from './input-model.ts';
import * as rows from './rows.ts';
import type { ThemeLike } from './rows.ts';

export interface PickedDirectory {
	directory: string;
}

export interface MoveOverlayOptions {
	title: string;
}

export class MoveOverlay implements Focusable {
	readonly width = 72;
	readonly minWidth = 44;
	readonly maxWidth = 72;
	readonly maxResults = 15;
	private readonly title: string;

	focused = false;

	private readonly model = new InputModel();
	private selectedIndex = 0;
	private results: DirEntry[] = [];

	private theme: ThemeLike;
	private cwd: string;
	private done: (result: PickedDirectory | undefined) => void;

	private cachedWidth?: number;
	private cachedFocused?: boolean;
	private cachedLines?: string[];

	constructor(
		theme: ThemeLike,
		cwd: string,
		done: (result: PickedDirectory | undefined) => void,
		options: MoveOverlayOptions = { title: 'Move to directory' },
	) {
		this.theme = theme;
		this.cwd = cwd;
		this.done = done;
		this.title = options.title;
		prefetchDirectory(cwd);
		this.updateResults();
	}

	handleInput(data: string): void {
		this.invalidateCache();

		if (matchesKey(data, 'escape')) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, 'return') || matchesKey(data, 'enter')) {
			this.confirmSelection();
			return;
		}
		if (matchesKey(data, 'up')) {
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, 'down')) {
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, 'tab')) {
			this.acceptCompletion();
			return;
		}

		if (matchesKey(data, 'left')) {
			this.model.moveCursor(-1);
			return;
		}
		if (matchesKey(data, 'right')) {
			this.model.moveCursor(1);
			return;
		}
		if (matchesKey(data, 'home') || matchesKey(data, 'ctrl+a')) {
			this.model.home();
			return;
		}
		if (matchesKey(data, 'end') || matchesKey(data, 'ctrl+e')) {
			this.model.end();
			return;
		}

		if (matchesKey(data, 'backspace')) {
			this.model.deleteBackward();
			this.afterEdit();
			return;
		}
		if (matchesKey(data, 'delete') || matchesKey(data, 'ctrl+d')) {
			this.model.deleteForward();
			this.afterEdit();
			return;
		}
		if (matchesKey(data, 'ctrl+u')) {
			this.model.killToStart();
			this.afterEdit();
			return;
		}
		if (matchesKey(data, 'ctrl+k')) {
			this.model.killToEnd();
			this.afterEdit();
			return;
		}
		if (matchesKey(data, 'ctrl+w') || matchesKey(data, 'alt+backspace')) {
			this.model.deleteWordBackward();
			this.afterEdit();
			return;
		}

		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.model.insert(data);
			this.afterEdit();
		}
	}

	render(termWidth: number): string[] {
		const w = Math.max(1, Math.min(this.maxWidth, termWidth));
		if (this.cachedLines && this.cachedWidth === w && this.cachedFocused === this.focused) {
			return this.cachedLines;
		}

		const th = this.theme;
		const innerW = w - 2;
		const lines: string[] = [];

		lines.push(rows.boxTop(th, innerW, this.title));
		lines.push(rows.blank(th, innerW));
		lines.push(rows.cell(th, rows.inputRow(th, innerW, this.model, this.focused)));
		lines.push(rows.blank(th, innerW));

		const visible = this.results.slice(0, this.maxResults);
		const hasMore = this.results.length > this.maxResults;
		const input = this.model.text;

		if (this.results.length === 0) {
			if (input.trim().length > 0) {
				lines.push(rows.messageRow(th, th.fg('warning', 'No matching directories'), innerW));
				lines.push(rows.messageRow(th, th.fg('dim', `Press Enter to create "${input.trim()}"`), innerW));
			} else {
				lines.push(rows.messageRow(th, th.fg('dim', 'No subdirectories in current folder'), innerW));
			}
		} else {
			for (let i = 0; i < visible.length; i++) {
				const item = visible[i];
				if (!item) continue;
				lines.push(rows.cell(th, rows.resultRow(th, innerW, item, i === this.selectedIndex)));
			}
			if (hasMore) {
				lines.push(rows.messageRow(th, th.fg('dim', '↓ more matches · keep typing to narrow'), innerW));
			}
		}

		lines.push(rows.blank(th, innerW));
		lines.push(
			rows.cell(
				th,
				rows.helpRow(
					th,
					innerW,
					this.results.length > 0 ? `${this.selectedIndex + 1}/${this.selectableCount}` : undefined,
				),
			),
		);
		lines.push(rows.boxBottom(th, innerW));

		this.cachedWidth = w;
		this.cachedFocused = this.focused;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.invalidateCache();
	}

	dispose(): void {
		this.invalidateCache();
	}

	private invalidateCache(): void {
		this.cachedWidth = undefined;
		this.cachedFocused = undefined;
		this.cachedLines = undefined;
	}

	private get selectableCount(): number {
		return Math.min(this.results.length, this.maxResults);
	}

	private moveSelection(delta: number): void {
		const n = this.selectableCount;
		if (n === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + n) % n;
	}

	private afterEdit(): void {
		this.selectedIndex = 0;
		this.updateResults();
	}

	private acceptCompletion(): void {
		const selected = this.results[this.selectedIndex];
		if (!selected) return;
		this.model.setText(selected.value);
		this.afterEdit();
	}

	private updateResults(): void {
		// One extra result detects overflow below the fold.
		this.results = findDirectories(this.model.text, this.cwd, this.maxResults + 1);
		if (this.selectedIndex >= this.selectableCount) {
			this.selectedIndex = Math.max(0, this.selectableCount - 1);
		}
	}

	private confirmSelection(): void {
		const selectedItem = this.results[this.selectedIndex];
		if (selectedItem) {
			this.done({ directory: selectedItem.value });
			return;
		}
		if (this.model.text.trim().length > 0) {
			this.done({ directory: this.model.text.trim() });
			return;
		}
		this.done(undefined);
	}
}

export async function pickTarget(
	args: string,
	ctx: ExtensionCommandContext,
	title: string,
): Promise<string | undefined> {
	const trimmed = args.trim();
	if (trimmed.length > 0) return trimmed;

	if (!ctx.hasUI || ctx.mode !== 'tui') {
		ctx.ui.notify('This command needs a directory argument outside interactive TUI mode', 'error');
		return undefined;
	}

	const result = await ctx.ui.custom<PickedDirectory | undefined>(
		(_tui, theme, _keybindings, done) => new MoveOverlay(theme, ctx.cwd, done, { title }),
		{ overlay: true },
	);
	return result?.directory;
}
