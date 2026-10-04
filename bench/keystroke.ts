/**
 * Hot-path micro-benchmark: directory suggestion latency (cold + warm) and
 * session relocation throughput. Run with `just bench` (or bun bench/keystroke.ts).
 * Numbers are for before/after comparisons, not absolute truth.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findDirectories } from '../src/search/suggest.ts';
import { relocateSession } from '../src/move-session/relocate.ts';
import { createSessionInDir } from '../src/session/factory.ts';

const DIR_COUNT = 5_000;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-move-bench-'));

function bench(label: string, fn: () => void, runs: number): void {
	fn(); // warm
	const start = performance.now();
	for (let i = 0; i < runs; i++) fn();
	const ms = (performance.now() - start) / runs;
	console.log(`  ${label}: ${ms.toFixed(3)} ms/op (${runs} runs)`);
}

try {
	// --- directory suggestions ---
	const cwd = path.join(ROOT, 'dirs');
	fs.mkdirSync(cwd, { recursive: true });
	for (let i = 0; i < DIR_COUNT; i++) {
		fs.mkdirSync(path.join(cwd, `project-${String(i).padStart(5, '0')}`));
	}
	console.log(`\nfindDirectories over ${DIR_COUNT} entries:`);
	bench('empty prefix', () => findDirectories('', cwd, 16), 200);
	bench('fuzzy query', () => findDirectories('proj-42', cwd, 16), 200);
	bench('no-match query', () => findDirectories('zzzzzzz', cwd, 16), 200);

	// --- session relocation ---
	console.log('\nrelocateSession:');
	for (const [label, size] of [
		['1 MB session', 1],
		['10 MB session', 10],
	] as const) {
		const srcDir = path.join(ROOT, `reloc-${label.replace(/\W/g, '')}`);
		const created = (() => {
			// Build a real session file, then pad it to size with message entries.
			const s = createSessionInDir(srcDir, { sessionDir: srcDir });
			const filler = JSON.stringify({
				type: 'message',
				id: 'warm-x',
				parentId: null,
				timestamp: 't',
				message: { role: 'user', content: 'x'.repeat(80) },
			});
			const needed = size * 1024 * 1024;
			let written = fs.statSync(s.file).size;
			while (written < needed) {
				fs.appendFileSync(s.file, filler + '\n');
				written += filler.length + 1;
			}
			return s;
		})();
		const targetDir = path.join(ROOT, `target-${label.replace(/\W/g, '')}`);
		fs.mkdirSync(targetDir, { recursive: true });
		const header = JSON.parse(fs.readFileSync(created.file, 'utf8').split('\n')[0] ?? '{}');
		const sourceSizeMb = (fs.statSync(created.file).size / 1024 / 1024).toFixed(1);
		bench(
			`${sourceSizeMb} MB source → new bucket`,
			() =>
				relocateSession({
					sourceFile: created.file,
					targetFile: path.join(targetDir, `moved-${Math.random().toString(36).slice(2)}.jsonl`),
					targetCwd: targetDir,
					header,
					currentLeafId: null,
				}),
			5,
		);
	}
} finally {
	fs.rmSync(ROOT, { recursive: true, force: true });
}
