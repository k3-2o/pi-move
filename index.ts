// --- pi-move: Directory Switcher for Pi ---

import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleMoveCommand } from "./src/move.js";

export default function piMoveExtension(pi: ExtensionAPI): void {
  // --- Lifecycle: session_shutdown ---
  // When leaving an empty session (user moved here via /move but sent
  // no messages), delete the file so it doesn't clutter /resume.
  pi.on("session_shutdown", (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    // Check for actual user/assistant messages, not just metadata entries
    // like model_change and thinking_level_change that pi auto-appends.
    const hasRealMessages = entries.some(
      (e) => e.type === "message" && (e.message.role === "user" || e.message.role === "assistant"),
    );
    if (hasRealMessages) return; // Has real messages — keep it

    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) return;

    try {
      fs.unlinkSync(sessionFile);
    } catch {
      // File already gone — skip
    }
  });

  // --- Command: /move ---

  pi.registerCommand("move", {
    description:
      "Move to a different directory — starts a fresh Pi session in the target directory",
    getArgumentCompletions: (_argumentPrefix: string): null => {
      // We don't use inline arg completion — the overlay handles it
      return null;
    },
    handler: async (args, ctx) => {
      await handleMoveCommand(args, ctx);
    },
  });
}
