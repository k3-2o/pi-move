import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleMoveCommand } from "./src/move.js";

export default function piMoveExtension(pi: ExtensionAPI): void {
  pi.registerCommand("move", {
    description: "Move to a different directory — starts a fresh Pi session in the target directory",
    getArgumentCompletions: (_argumentPrefix: string): null => {
      return null;
    },
    handler: async (args, ctx) => {
      await handleMoveCommand(args, ctx);
    },
  });
}
