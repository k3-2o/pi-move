import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  matchesKey,
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { type DirEntry, findDirectories, prefetchDirectory } from "./utils.js";

export interface MoveOverlayResult {
  directory: string;
}

export class MoveOverlay implements Focusable {
  /** Preferred overlay width. The render pass clamps to the terminal. */
  readonly width = 72;
  readonly minWidth = 44;
  readonly maxWidth = 72;
  readonly maxResults = 15;
  private readonly title = "📂 Move to directory";

  focused = false;

  private input = "";
  private cursor = 0;
  private selectedIndex = 0;
  private results: DirEntry[] = [];
  private inputScrollOffset = 0;

  private theme: Theme;
  private cwd: string;
  private done: (result: MoveOverlayResult | undefined) => void;

  // Render cache
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(theme: Theme, cwd: string, done: (result: MoveOverlayResult | undefined) => void) {
    this.theme = theme;
    this.cwd = cwd;
    this.done = done;
    prefetchDirectory(cwd);
    this.updateResults();
  }

  // ---------- input handling ----------

  handleInput(data: string): void {
    this.invalidateCache();

    if (matchesKey(data, "escape")) {
      this.done(undefined);
      return;
    }
    if (matchesKey(data, "return") || matchesKey(data, "enter")) {
      this.confirmSelection();
      return;
    }

    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }
    if (matchesKey(data, "tab")) {
      this.acceptCompletion();
      return;
    }

    if (matchesKey(data, "left")) {
      this.cursor = Math.max(0, this.cursor - 1);
      return;
    }
    if (matchesKey(data, "right")) {
      this.cursor = Math.min(this.input.length, this.cursor + 1);
      return;
    }
    if (matchesKey(data, "home") || matchesKey(data, "ctrl+a")) {
      this.cursor = 0;
      return;
    }
    if (matchesKey(data, "end") || matchesKey(data, "ctrl+e")) {
      this.cursor = this.input.length;
      return;
    }

    if (matchesKey(data, "backspace")) {
      this.deleteBackward();
      return;
    }
    if (matchesKey(data, "delete") || matchesKey(data, "ctrl+d")) {
      this.deleteForward();
      return;
    }
    if (matchesKey(data, "ctrl+u")) {
      this.input = this.input.slice(this.cursor);
      this.cursor = 0;
      this.resetSelection();
      this.updateResults();
      return;
    }
    if (matchesKey(data, "ctrl+k")) {
      this.input = this.input.slice(0, this.cursor);
      this.resetSelection();
      this.updateResults();
      return;
    }
    if (matchesKey(data, "ctrl+w") || matchesKey(data, "alt+backspace")) {
      this.deleteWordBackward();
      return;
    }

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.input = this.input.slice(0, this.cursor) + data + this.input.slice(this.cursor);
      this.cursor++;
      this.resetSelection();
      this.updateResults();
    }
  }

  // ---------- rendering ----------

  render(termWidth: number): string[] {
    const w = Math.max(this.minWidth, Math.min(this.maxWidth, termWidth));
    if (this.cachedLines && this.cachedWidth === w) {
      return this.cachedLines;
    }

    const th = this.theme;
    const innerW = w - 2;
    const lines: string[] = [];

    const border = (s: string) => th.fg("border", s);
    const cell = (inner: string) => border("│") + inner + border("│");
    const blank = cell(" ".repeat(innerW));

    // Top border with title.
    lines.push(this.renderTopBorder(innerW));
    lines.push(blank);

    // Input line.
    lines.push(cell(this.renderInput(innerW)));
    lines.push(blank);

    // Results.
    const visible = this.results.slice(0, this.maxResults);
    const hasMore = this.results.length > this.maxResults;

    if (this.results.length === 0) {
      if (this.input.trim().length > 0) {
        lines.push(
          cell(
            truncateToWidth(` ${th.fg("warning", "No matching directories")}`, innerW, "", true),
          ),
        );
        const createHint = truncateToWidth(
          ` ${th.fg("dim", `Press Enter to create "${this.input.trim()}"`)}`,
          innerW,
          "",
          true,
        );
        lines.push(cell(createHint));
      } else {
        lines.push(
          cell(
            truncateToWidth(
              ` ${th.fg("dim", "No subdirectories in current folder")}`,
              innerW,
              "",
              true,
            ),
          ),
        );
      }
    } else {
      for (let i = 0; i < visible.length; i++) {
        const item = visible[i];
        if (!item) continue;
        lines.push(cell(this.renderResultRow(item, i === this.selectedIndex, innerW)));
      }
      if (hasMore) {
        lines.push(
          cell(
            truncateToWidth(
              ` ${th.fg("dim", "↓ more matches — keep typing to narrow")}`,
              innerW,
              "",
              true,
            ),
          ),
        );
      }
    }

    lines.push(blank);
    lines.push(cell(this.renderHelp(innerW)));
    lines.push(border(`╰${"─".repeat(innerW)}╯`));

    this.cachedWidth = w;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.invalidateCache();
  }

  dispose(): void {
    this.invalidateCache();
  }

  // ---------- helpers ----------

  private invalidateCache(): void {
    this.cachedWidth = undefined;
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

  private acceptCompletion(): void {
    const selected = this.results[this.selectedIndex];
    if (!selected) return;
    this.input = selected.value;
    this.cursor = this.input.length;
    this.inputScrollOffset = 0;
    this.resetSelection();
    this.updateResults();
  }

  private deleteBackward(): void {
    if (this.cursor <= 0) return;
    this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
    this.cursor--;
    this.resetSelection();
    this.updateResults();
  }

  private deleteForward(): void {
    if (this.cursor >= this.input.length) return;
    this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + 1);
    this.resetSelection();
    this.updateResults();
  }

  private deleteWordBackward(): void {
    if (this.cursor <= 0) return;
    let i = this.cursor;
    // Skip trailing separators, then consume the preceding word segment.
    while (i > 0 && /[\\/\s]/.test(this.input[i - 1] ?? "")) i--;
    while (i > 0 && !/[\\/\s]/.test(this.input[i - 1] ?? "")) i--;
    this.input = this.input.slice(0, i) + this.input.slice(this.cursor);
    this.cursor = i;
    this.resetSelection();
    this.updateResults();
  }

  private resetSelection(): void {
    this.selectedIndex = 0;
  }

  private updateResults(): void {
    // Ask for one extra result so we can tell whether there are more below the fold.
    this.results = findDirectories(this.input, this.cwd, this.maxResults + 1);
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
    if (this.input.trim().length > 0) {
      this.done({ directory: this.input.trim() });
      return;
    }
    this.done(undefined);
  }

  private renderTopBorder(innerW: number): string {
    const th = this.theme;
    const title = ` ${this.title} `;
    const titleW = visibleWidth(title);
    const leadDashW = 1;
    const tailDashCount = Math.max(1, innerW - leadDashW - titleW);
    return (
      th.fg("border", "╭") +
      th.fg("border", "─") +
      th.fg("accent", title) +
      th.fg("border", "─".repeat(tailDashCount)) +
      th.fg("border", "╮")
    );
  }

  private renderInput(innerW: number): string {
    const th = this.theme;
    const prompt = th.fg("accent", "  Path: ");
    const promptW = visibleWidth(prompt);
    const availW = Math.max(1, innerW - promptW);

    // Horizontal scroll so the cursor never drifts off-screen.
    let offset = this.inputScrollOffset;
    if (offset > this.cursor) offset = this.cursor;
    if (this.cursor >= offset + availW) offset = this.cursor - availW + 1;
    offset = Math.max(0, offset);
    this.inputScrollOffset = offset;

    const marker = this.focused ? CURSOR_MARKER : "";
    const cursorChar = this.cursor < this.input.length ? (this.input[this.cursor] ?? " ") : " ";

    let core: string;
    if (this.input.length === 0) {
      // Place the cursor at column 0 with the placeholder after it.
      const placeholder = th.fg("dim", "Type a directory path…");
      core = `${marker}\x1b[7m${cursorChar}\x1b[27m${placeholder}`;
    } else {
      const before = this.input.slice(0, this.cursor);
      const after = this.input.slice(this.cursor + 1);
      core = `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
    }

    const field = sliceByColumn(core, offset, availW);
    const fieldW = visibleWidth(field);
    const padded = field + (fieldW < availW ? " ".repeat(availW - fieldW) : "");
    return prompt + padded;
  }

  private renderResultRow(item: DirEntry, isSelected: boolean, innerW: number): string {
    const th = this.theme;
    const prefix = isSelected ? "❯ " : "  ";
    const prefixW = 2;
    const labelW = visibleWidth(item.label);
    const gap = 2;
    const descAvail = innerW - prefixW - labelW - gap;

    if (isSelected) {
      // Plain text on selectedBg avoids nested-SGR reset issues.
      let body = `${prefix}${item.label}`;
      if (item.description && descAvail >= 12) {
        body += " ".repeat(gap) + truncateToWidth(item.description, descAvail, "");
      }
      return th.bg("selectedBg", truncateToWidth(body, innerW, "", true));
    }

    let body = `${prefix}${th.fg("text", item.label)}`;
    if (item.description && descAvail >= 12) {
      body += th.fg("dim", " ".repeat(gap) + truncateToWidth(item.description, descAvail, ""));
    }
    return truncateToWidth(body, innerW, "", true);
  }

  private renderHelp(innerW: number): string {
    const th = this.theme;
    const keys = "↑↓ navigate · Tab complete · Enter select · Esc cancel";
    let content = th.fg("dim", ` ${keys}`);
    if (this.results.length > 0) {
      content += th.fg("dim", `  ${this.selectedIndex + 1}/${this.selectableCount}`);
    }
    content += " ";
    return truncateToWidth(content, innerW, "", true);
  }
}
