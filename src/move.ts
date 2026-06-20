import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { MoveOverlay, type MoveOverlayResult } from "./overlay.js";
import { resolveDirectory } from "./utils.js";

export async function handleMoveCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmedArg = args.trim();

  if (trimmedArg.length > 0) {
    const target = await resolveOrCreateDirectory(trimmedArg, ctx);
    if (target !== null) await switchToNewSession(target, ctx);
    return;
  }

  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify("/move requires interactive TUI mode", "error");
    return;
  }

  const result = await ctx.ui.custom<MoveOverlayResult | undefined>(
    (_tui, theme, _keybindings, done) => new MoveOverlay(theme, ctx.cwd, done),
    { overlay: true },
  );

  if (result === undefined) return;

  const target = await resolveOrCreateDirectory(result.directory, ctx);
  if (target !== null) await switchToNewSession(target, ctx);
}

async function resolveOrCreateDirectory(input: string, ctx: ExtensionCommandContext): Promise<string | null> {
  const resolved = resolveDirectory(input, ctx.cwd);
  if (resolved !== null) return resolved;

  let targetPath: string;
  if (input.startsWith("~/")) {
    targetPath = path.join(os.homedir(), input.slice(2));
  } else if (path.isAbsolute(input)) {
    targetPath = path.normalize(input);
  } else {
    targetPath = path.resolve(ctx.cwd, input);
  }

  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    ctx.ui.notify(`Cannot create "${path.basename(targetPath)}": parent directory does not exist`, "error");
    return null;
  }

  const basename = path.basename(targetPath);
  const confirmed = await ctx.ui.confirm("Create directory?", `"${basename}" does not exist. Create it?`);
  if (!confirmed) return null;

  try {
    fs.mkdirSync(targetPath, { recursive: true });
    return targetPath;
  } catch (err) {
    ctx.ui.notify(`Failed to create directory: ${err instanceof Error ? err.message : String(err)}`, "error");
    return null;
  }
}

async function switchToNewSession(targetDir: string, ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify(`Moving to ${targetDir}...`, "info");

  try {
    // Create session in the target directory's own session folder.
    // This keeps cwd and sessionDir consistent so usesDefaultSessionDir()
    // returns true, and /resume Tab correctly calls listAll().
    const newSession = SessionManager.create(targetDir);
    const sessionFile = newSession.getSessionFile();

    if (!sessionFile) {
      ctx.ui.notify("Failed to create new session", "error");
      return;
    }

    const sessionId = newSession.getSessionId();
    const header = {
      type: "session",
      version: 3,
      id: sessionId,
      timestamp: new Date().toISOString(),
      cwd: targetDir,
    };

    // Ensure the target session directory exists
    const sessionDir = newSession.getSessionDir();
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    fs.writeFileSync(sessionFile, JSON.stringify(header) + "\n", "utf-8");
    await ctx.switchSession(sessionFile);
  } catch (err) {
    ctx.ui.notify(`Failed to move: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}
