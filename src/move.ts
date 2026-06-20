import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { MoveOverlay, type MoveOverlayResult } from "./overlay.js";
import { resolveDirectory } from "./utils.js";

/**
 * Handle the /move command.
 */
export async function handleMoveCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmedArg = args.trim();

  if (trimmedArg.length > 0) {
    const target = await resolveOrCreateDirectory(trimmedArg, ctx);
    if (target !== null) {
      await switchToNewSession(target, ctx);
    }
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
  if (target !== null) {
    await switchToNewSession(target, ctx);
  }
}

/**
 * Resolve a directory path. If it doesn't exist, prompt the user to create it.
 * Returns the resolved path, or null if the user cancels or the path is invalid.
 */
async function resolveOrCreateDirectory(
  input: string,
  ctx: ExtensionCommandContext,
): Promise<string | null> {
  // Try normal resolution first
  const resolved = resolveDirectory(input, ctx.cwd);
  if (resolved !== null) return resolved;

  // Directory doesn't exist. Check if we can create it.
  // Resolve the path to get the intended full path.
  let targetPath: string;
  if (input.startsWith("~/")) {
    targetPath = path.join(os.homedir(), input.slice(2));
  } else if (path.isAbsolute(input)) {
    targetPath = path.normalize(input);
  } else {
    targetPath = path.resolve(ctx.cwd, input);
  }

  // Check if parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    ctx.ui.notify(
      `Cannot create "${path.basename(targetPath)}": parent directory does not exist`,
      "error",
    );
    return null;
  }

  // Prompt user to create it
  const basename = path.basename(targetPath);
  const confirmed = await ctx.ui.confirm(
    "Create directory?",
    `"${basename}" does not exist. Create it?`,
  );

  if (!confirmed) return null;

  try {
    fs.mkdirSync(targetPath, { recursive: true });
    return targetPath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to create directory: ${message}`, "error");
    return null;
  }
}

/**
 * Switch to a fresh Pi session in the target directory.
 *
 * Strategy: Create a new session file in the CURRENT session directory
 * (so /resume still scans the same folder) but with the target directory
 * as the session's CWD. Then switch to that session.
 *
 * IMPORTANT: SessionManager.create() does NOT write the file to disk.
 * We must write the session header ourselves before switchSession reads it.
 */
async function switchToNewSession(targetDir: string, ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify(`Moving to ${targetDir}...`, "info");

  try {
    // Create the session manager — this generates a file path but does NOT
    // write the file. We need the file on disk so switchSession can open it.
    const currentSessionDir = ctx.sessionManager.getSessionDir();
    const newSession = SessionManager.create(targetDir, currentSessionDir);
    const sessionFile = newSession.getSessionFile();

    if (!sessionFile) {
      ctx.ui.notify("Failed to create new session", "error");
      return;
    }

    // Write the session header to disk. Without this, SessionManager.open()
    // in switchSession cannot read the CWD from the header and falls back
    // to process.cwd() — which is the OLD directory.
    const sessionId = newSession.getSessionId();
    const header = {
      type: "session",
      version: 3,
      id: sessionId,
      timestamp: new Date().toISOString(),
      cwd: targetDir,
    };

    // Ensure the session directory exists
    if (!fs.existsSync(currentSessionDir)) {
      fs.mkdirSync(currentSessionDir, { recursive: true });
    }

    fs.writeFileSync(sessionFile, JSON.stringify(header) + "\n", "utf-8");

    // Switch to the new session. Pi opens the file, reads cwd: targetDir
    // from the header, and creates a fresh runtime with the target CWD.
    await ctx.switchSession(sessionFile);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to move: ${message}`, "error");
  }
}
