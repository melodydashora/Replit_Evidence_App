#!/usr/bin/env bash
# Keep Claude Code's state (memory, settings, sign-in, transcripts, workflow journals) on the
# persistent workspace volume. On Replit, /home/runner is an ephemeral overlay that is rebuilt on
# every container restart; only /home/runner/workspace survives. Claude Code honours
# CLAUDE_CONFIG_DIR (set in .replit [env]); this script is the fallback for any shell that does not
# get that variable: it replaces ~/.claude and ~/.claude.json with links into the persistent dir.
# Run from .replit onBoot; safe to run repeatedly. The same variable is also exported from .config/bashrc, which Replit's
# shell sources for Shell-tab sessions. Note: Claude Code rewrites .claude.json by renaming a temp file into place, which
# turns a symlinked FILE back into a plain file; so in fallback mode (variable unset) .claude.json is the one piece of
# state that may not persist. Everything inside the ~/.claude directory link does.
set -u
PERSIST="${CLAUDE_CONFIG_DIR:-/home/runner/workspace/.config/claude}"
HOME_DIR="${HOME:-/home/runner}"
mkdir -p "$PERSIST/projects"
chmod 700 "$PERSIST"

link_path() { # link_path <ephemeral path> <persistent path>
  local src="$1" dst="$2"
  [ -L "$src" ] && return 0
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -an "$src/." "$dst/" 2>/dev/null || true   # keep anything written before this ran; never overwrite persisted files
    rm -rf "$src"
  elif [ -e "$src" ]; then
    [ -e "$dst" ] || cp -a "$src" "$dst"
    rm -f "$src"
  fi
  ln -sfn "$dst" "$src"
}

link_path "$HOME_DIR/.claude" "$PERSIST"
link_path "$HOME_DIR/.claude.json" "$PERSIST/.claude.json"
echo "claude-persist: $HOME_DIR/.claude -> $(readlink -f "$HOME_DIR/.claude")"

# The installer's launcher (~/.local/bin/claude) is also in the ephemeral home; recreate it so both paths work.
VERS="/home/runner/workspace/.local/share/claude/versions"
NEWEST="$(ls -1 "$VERS" 2>/dev/null | sort -V | tail -n 1)"
if [ -n "$NEWEST" ]; then
  mkdir -p "$HOME_DIR/.local/bin"
  ln -sfn "$VERS/$NEWEST" "$HOME_DIR/.local/bin/claude"
  echo "claude-persist: $HOME_DIR/.local/bin/claude -> $VERS/$NEWEST"
fi
