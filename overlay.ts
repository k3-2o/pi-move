import type { Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type Focusable, matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { findDirectories } from "./utils.js";

/**
 * Result emitted by the move overlay when the user confirms a selection.
 */
export interface MoveOverlayResult {
  /** The selected directory path (resolved, absolute). */
  directory: string;
}

/**
 * Overlay component for the /move command.
 *
 * Renders a floating modal with:
 * - A text input field for typing a directory path
 * - A list of matching directories below (updated on each keystroke)
 * - Keyboard navigation: type to filter, ↑↓ to select, Enter to confirm, Esc to cancel
 */
export class MoveOverlay implements Focusable {
  readonly width = 68;
  readonly maxResults = 15;

  /** Focusable interface — set by TUI when focus changes */
  focused = false;

  private input = "";
  private cursor = 0;
  private selectedIndex = 0;
  private results: Array<{ value: string; label: string; description?: string }> = [];
  private theme: Theme;
  private done: (result: MoveOverlayResult | undefined) => void;
  private cwd: string;

  constructor(theme: Theme, cwd: string, done: (result: MoveOverlayResult | undefined) => void) {
    this.theme = theme;
    this.cwd = cwd;
    this.done = done;
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

    if (matchesKey(data, "up")) {
      if (this.results.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      }
      return;
    }

    if (matchesKey(data, "down")) {
      if (this.results.length > 0) {
        this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
      }
      return;
    }

    if (matchesKey(data, "tab")) {
      // Tab auto-completes the selected item into the input
      const selected = this.results[this.selectedIndex];
      if (selected) {
        this.input = selected.value;
        this.cursor = this.input.length;
        this.updateResults();
      }
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.cursor > 0) {
        this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
        this.cursor--;
        this.selectedIndex = 0;
        this.updateResults();
      }
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

    // Regular character input
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.input = this.input.slice(0, this.cursor) + data + this.input.slice(this.cursor);
      this.cursor++;
      this.selectedIndex = 0;
      this.updateResults();
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
        (vis > innerW ? content.slice(0, innerW) : pad(content, innerW)) +
        th.fg("border", "│")
      );
    };

    // ── Top border ──
    lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

    // ── Title ──
    lines.push(row(` ${th.fg("accent", "📂 Move to directory")}`));
    lines.push(row(""));

    // ── Input field ──
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

    // ── Results list ──
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

    // ── Footer ──
    lines.push(row(` ${th.fg("dim", "Type to filter · ↑↓·Tab·Enter·Esc")}`));

    // ── Bottom border ──
    lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

    return lines;
  }

  invalidate(): void {
    // No external state to invalidate
  }

  dispose(): void {
    // No resources to clean up
  }

  private updateResults(): void {
    this.results = findDirectories(this.input, this.cwd, this.maxResults + 5);
    if (this.selectedIndex >= this.results.length) {
      this.selectedIndex = Math.max(0, this.results.length - 1);
    }
  }

  private confirmSelection(): void {
    // If there's a selection, use it
    const selectedItem = this.results[this.selectedIndex];
    if (selectedItem) {
      this.done({ directory: selectedItem.value });
      return;
    }

    // If input is non-empty, try resolving it directly
    if (this.input.trim().length > 0) {
      // Resolve will be done by the handler
      this.done({ directory: this.input.trim() });
      return;
    }

    // Nothing to select
    this.done(undefined);
  }
}
