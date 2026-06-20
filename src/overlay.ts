import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  matchesKey,
  sliceByColumn,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { findDirectories, prefetchDirectory } from "./utils.js";

export interface MoveOverlayResult {
  directory: string;
}

export class MoveOverlay implements Focusable {
  readonly width = 68;
  readonly maxResults = 15;

  focused = false;

  private input = "";
  private cursor = 0;
  private selectedIndex = 0;
  private results: Array<{ value: string; label: string; description?: string }> = [];
  private theme: Theme;
  private done: (result: MoveOverlayResult | undefined) => void;
  private cwd: string;
  private _updateTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(theme: Theme, cwd: string, done: (result: MoveOverlayResult | undefined) => void) {
    this.theme = theme;
    this.cwd = cwd;
    this.done = done;
    prefetchDirectory(cwd);
    this.updateResults();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.done(undefined);
      return;
    }
    if (matchesKey(data, "return")) {
      this.confirmSelection();
      return;
    }

    if (matchesKey(data, "up") && this.results.length > 0) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return;
    }

    if (matchesKey(data, "down") && this.results.length > 0) {
      this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
      return;
    }

    if (matchesKey(data, "tab")) {
      const selected = this.results[this.selectedIndex];
      if (selected) {
        this.input = selected.value;
        this.cursor = this.input.length;
        this.updateResults();
      }
      return;
    }

    if (matchesKey(data, "backspace") && this.cursor > 0) {
      this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
      this.cursor--;
      this.selectedIndex = 0;
      this.scheduleUpdate();
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

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.input = this.input.slice(0, this.cursor) + data + this.input.slice(this.cursor);
      this.cursor++;
      this.selectedIndex = 0;
      this.scheduleUpdate();
    }
  }

  render(_width: number): string[] {
    const w = this.width;
    const th = this.theme;
    const innerW = w - 2;
    const lines: string[] = [];

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };

    const row = (content: string) => {
      const vis = visibleWidth(content);
      return (
        th.fg("border", "│") +
        (vis > innerW ? sliceByColumn(content, 0, innerW) : pad(content, innerW)) +
        th.fg("border", "│")
      );
    };

    lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));
    lines.push(row(` ${th.fg("accent", "📂 Move to directory")}`));
    lines.push(row(""));

    const inputPrompt = th.fg("text", "  Path: ");
    let inputDisplay = this.input;
    if (this.input.length > 0) {
      const before = inputDisplay.slice(0, this.cursor);
      const cursorChar = this.cursor < inputDisplay.length ? inputDisplay[this.cursor] : " ";
      const after = inputDisplay.slice(this.cursor + 1);
      const marker = this.focused ? CURSOR_MARKER : "";
      inputDisplay = `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
    } else {
      const placeholder = th.fg("dim", "Type a directory path...");
      const marker = this.focused ? CURSOR_MARKER : "";
      inputDisplay = `${placeholder}${marker}\x1b[7m \x1b[27m`;
    }
    lines.push(row(`${inputPrompt}${inputDisplay}`));
    lines.push(row(""));

    if (this.results.length === 0 && this.input.length > 0) {
      lines.push(row(` ${th.fg("dim", "No matching directories")}`));
    } else {
      const visibleResults = this.results.slice(0, this.maxResults);
      for (let i = 0; i < visibleResults.length; i++) {
        const item = visibleResults[i];
        if (!item) continue;
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? th.fg("accent", " ▶") : "  ";
        const label = isSelected ? th.fg("accent", item.label) : th.fg("text", item.label);
        const desc = item.description ? th.fg("dim", ` ${item.description}`) : "";
        lines.push(row(`${prefix} ${label}${desc}`));
      }
    }

    lines.push(row(""));
    lines.push(row(` ${th.fg("dim", "Type to filter · ↑↓·Tab·Enter·Esc")}`));
    lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

    return lines;
  }

  invalidate(): void {}
  dispose(): void {}

  private scheduleUpdate(): void {
    if (this._updateTimeout) clearTimeout(this._updateTimeout);
    this._updateTimeout = setTimeout(() => {
      this.updateResults();
      this._updateTimeout = undefined;
    }, 50);
  }

  private updateResults(): void {
    this.results = findDirectories(this.input, this.cwd, this.maxResults + 5);
    if (this.selectedIndex >= this.results.length) {
      this.selectedIndex = Math.max(0, this.results.length - 1);
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
}
