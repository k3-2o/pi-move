import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleMoveCommand } from "./src/move.js";

export default function piMoveExtension(pi: ExtensionAPI): void {
  // Delete move-created sessions that ended up with no real messages.
  pi.on("session_shutdown", (event, ctx) => {
    // Never delete on reload — the user is coming back, not leaving.
    if (event.reason === "reload") return;
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
