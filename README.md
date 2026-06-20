# pi-move

A Pi extension that adds `/move` — switch to a fresh Pi session in any directory
from inside Pi. No quitting.

## Why

Pi works in one directory at a time. To switch projects you normally have to
quit, `cd`, and restart. `/move` does that in one step.

## How

Type `/move`, an overlay pops up with a path input. Start typing, tab to autocomplete directories 
as you go. Press Enter and Pi creates a new empty session in that
directory and switches to it.

If the directory doesn't exist, Pi asks if you want to create it. 
no need to exit to make a new directory for your project

## Requirements

- Pi 0.79+
- `fd` (pi usually demands you have this on start-up, as a pi user you probably already have it)

## Install

```bash
pi install pi-move
# or
pi install git:github.com/k3-2o/pi-move
```

Or clone manually:

```bash
git clone https://github.com/k3-2o/pi-move ~/.pi/agent/extensions/pi-move
```

## License

MIT
