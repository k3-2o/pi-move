# pi-move

[![npm](https://img.shields.io/npm/v/@k3_2o/pi-move)](https://www.npmjs.com/package/@k3_2o/pi-move)

Pi extension with two commands:

- **`/cd`** switches to a fresh session in any directory, no quitting.
- **`/move`** relocates the *current* session into another directory and keeps
  working: same session, same history, new home.

## /cd: switch directory, fresh session

Pi works in one directory at a time. To switch projects you normally have to
quit, `cd`, and restart. `/cd` does that in one step.

Type `/cd`, an overlay pops up with a path input. Start typing, tab to
autocomplete directories as you go. Press Enter and Pi creates a new empty
session in that directory and switches to it.

If the directory doesn't exist, Pi asks if you want to create it. To make a new
directory for your project you don't need to exit first.

## /move: relocate this session

Move the current session into another directory's session bucket, keeping its
id and full history, then switch to it in-process. Because the moved session's
`cwd` is the target, Pi rebuilds the runtime from that directory on switch:
its settings, context files (AGENTS.md), MCP servers, skills, themes, and
project trust all load as if the session had started there.

Usage is the same as `/cd`. Pass an argument or use the autocomplete overlay.
Useful for:

- the project you're working in moved or was cloned elsewhere
- hopping between a repo's worktrees
- fixing a session that started in the wrong directory

The original session file is only removed after the new one is live; cancelling
or failing leaves it untouched. Sessions relocated via `/move` are marked with
a `pi-move` record in the session file, so the empty-session reaper never
touches them.

## Requirements

- Pi 1.0.1+
- `fd` (pi usually demands you have this on start-up, as a pi user you probably already have it)

## Install

```bash
pi install npm:@k3_2o/pi-move
# or
pi install git:github.com/k3-2o/pi-move
```

Or clone manually:

```bash
git clone https://github.com/k3-2o/pi-move ~/.pi/agent/extensions/pi-move
```

## Development

```bash
just check    # typecheck + tests + lint + format-check
just bench    # suggestion-latency and relocation-throughput micro-benchmarks
```

## License

MIT