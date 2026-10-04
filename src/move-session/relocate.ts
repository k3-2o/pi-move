import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { CustomEntry, SessionHeader } from '@earendil-works/pi-coding-agent';
import { removeFileBestEffort } from '../fs/cache.ts';

export interface MoveProvenance {
	from: string;
	to: string;
	sourceFile: string;
	targetFile: string;
	movedAt: string;
}

export interface RelocateInput {
	sourceFile: string;
	targetFile: string;
	targetCwd: string;
	header: SessionHeader;
	/** Branch tip — the provenance entry's parent. Null when empty. */
	currentLeafId: string | null;
}

export interface RelocateResult {
	targetFile: string;
	header: SessionHeader;
}

/** Bound the header scan; anything longer is not a session we wrote. */
const HEADER_SCAN_MAX = 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;

/** Patched header (cwd, parentSession dropped), streamed body, pi-move marker, atomic rename. */
export function relocateSession(input: RelocateInput): RelocateResult {
	const { sourceFile, targetFile, targetCwd, header, currentLeafId } = input;
	const tmpFile = `${targetFile}.pi-move-${randomUUID()}.tmp`;

	const nextHeader: SessionHeader = { ...header, cwd: targetCwd };
	delete (nextHeader as { parentSession?: string }).parentSession;

	let readFd: number | undefined;
	let writeFd: number | undefined;
	try {
		readFd = fs.openSync(sourceFile, 'r');
		const stat = fs.fstatSync(readFd);
		if (stat.size < 1) throw new Error(`Session file is empty: ${sourceFile}`);

		// Find the header's newline without parsing the body.
		const head = Buffer.alloc(Math.min(HEADER_SCAN_MAX, stat.size));
		const headLen = fs.readSync(readFd, head, 0, head.length, 0);
		const newlineAt = head.indexOf(0x0a, 0);
		if (newlineAt === -1 || newlineAt >= headLen) {
			throw new Error(`Session file has no newline-terminated header: ${sourceFile}`);
		}
		const headerBytes = newlineAt + 1;

		writeFd = fs.openSync(tmpFile, 'w');
		fs.writeSync(writeFd, Buffer.from(JSON.stringify(nextHeader) + '\n', 'utf8'));

		const chunk = Buffer.alloc(CHUNK_SIZE);
		let position = headerBytes;
		let lastByte = 0x0a; // empty body: header's own newline separates the provenance below
		for (;;) {
			const read = fs.readSync(readFd, chunk, 0, CHUNK_SIZE, position);
			if (read === 0) break;
			lastByte = chunk[read - 1] ?? lastByte;
			fs.writeSync(writeFd, chunk, 0, read);
			position += read;
		}

		if (currentLeafId !== null) {
			const movedAt = new Date().toISOString();
			const provenance: CustomEntry<MoveProvenance> = {
				type: 'custom',
				customType: 'pi-move',
				id: `move-${randomUUID()}`,
				parentId: currentLeafId,
				timestamp: movedAt,
				data: { from: header.cwd, to: targetCwd, sourceFile, targetFile, movedAt },
			};
			// Newline first: a body without a trailing newline would merge the marker into the last entry.
			if (lastByte !== 0x0a) fs.writeSync(writeFd, Buffer.from('\n', 'utf8'));
			fs.writeSync(writeFd, Buffer.from(JSON.stringify(provenance) + '\n', 'utf8'));
		}

		// Flush before the rename makes the move visible.
		fs.fsyncSync(writeFd);
		fs.closeSync(writeFd);
		writeFd = undefined;
		fs.closeSync(readFd);
		readFd = undefined;

		fs.renameSync(tmpFile, targetFile);
	} catch (err) {
		removeFileBestEffort(tmpFile);
		throw err;
	} finally {
		if (writeFd !== undefined) {
			try {
				fs.closeSync(writeFd);
			} catch {
				/* already closed */
			}
		}
		if (readFd !== undefined) {
			try {
				fs.closeSync(readFd);
			} catch {
				/* already closed */
			}
		}
	}

	return { targetFile, header: nextHeader };
}
