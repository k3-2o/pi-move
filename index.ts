import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleMoveCommand } from "./src/move.js";

export default function piMoveExtension(pi: ExtensionAPI): void {
  // Clean up empty move sessions when leaving them.
  // Uses in-memory entries (always current — appended before persist)
  // and only deletes sessions with no real user/assistant messages.
  pi.on("session_shutdown", (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const hasRealMessages = entries.some(
      (e) => e.type === "message" && (e.message.role === "user" || e.message.role === "assistant"),
    );
    if (hasRealMessages) return;

    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) return;
    try {
      fs.unlinkSync(sessionFile);
    } catch {
      /* file gone */
    }
  });

  pi.registerCommand("move", {
    description:
      "Move to a different directory — starts a fresh Pi session in the target directory",
    getArgumentCompletions: (_argumentPrefix: string): null => {
      return null;
    },
    handler: async (args, ctx) => {
      await handleMoveCommand(args, ctx);
    },
  });
}
