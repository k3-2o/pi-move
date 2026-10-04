export class InputModel {
	text = '';
	cursor = 0;
	/** Horizontal scroll offset so the cursor never drifts off-screen. */
	scrollOffset = 0;

	setText(text: string): void {
		this.text = text;
		this.cursor = text.length;
		this.scrollOffset = 0;
	}

	insert(ch: string): void {
		this.text = this.text.slice(0, this.cursor) + ch + this.text.slice(this.cursor);
		this.cursor++;
	}

	deleteBackward(): void {
		if (this.cursor <= 0) return;
		this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
		this.cursor--;
	}

	deleteForward(): void {
		if (this.cursor >= this.text.length) return;
		this.text = this.text.slice(0, this.cursor) + this.text.slice(this.cursor + 1);
	}

	/** Delete back to (and including) the preceding path/word separator. */
	deleteWordBackward(): void {
		if (this.cursor <= 0) return;
		let i = this.cursor;
		while (i > 0 && /[\\/\s]/.test(this.text[i - 1] ?? '')) i--;
		while (i > 0 && !/[\\/\s]/.test(this.text[i - 1] ?? '')) i--;
		this.text = this.text.slice(0, i) + this.text.slice(this.cursor);
		this.cursor = i;
	}

	killToStart(): void {
		this.text = this.text.slice(this.cursor);
		this.cursor = 0;
	}

	killToEnd(): void {
		this.text = this.text.slice(0, this.cursor);
	}

	moveCursor(delta: number): void {
		this.cursor = Math.max(0, Math.min(this.text.length, this.cursor + delta));
	}

	home(): void {
		this.cursor = 0;
	}

	end(): void {
		this.cursor = this.text.length;
	}

	/** Remember the previous offset so the view stays stable across renders. */
	offsetFor(availWidth: number): number {
		let offset = this.scrollOffset;
		if (offset > this.cursor) offset = this.cursor;
		if (this.cursor >= offset + availWidth) offset = this.cursor - availWidth + 1;
		offset = Math.max(0, offset);
		this.scrollOffset = offset;
		return offset;
	}
}
