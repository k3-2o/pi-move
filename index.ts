import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerCdCommand } from './src/cd/command.ts';
import { registerMoveCommand } from './src/move-session/command.ts';
import { registerReaper } from './src/session/cleanup.ts';

export default function piMoveExtension(pi: ExtensionAPI): void {
	registerCdCommand(pi);
	registerMoveCommand(pi);
	registerReaper(pi);
}
