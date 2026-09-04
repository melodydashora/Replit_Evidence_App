#!/usr/bin/env bash
# Keep Claude Code's state (memory, settings, sign-in, transcripts, workflow journals) on the persistent workspace
# volume. On Replit, /home/runner is an ephemeral overlay rebuilt on every container restart; only
# /home/runner/workspace survives. Claude Code reads CLAUDE_CONFIG_DIR (set in .replit [env] and exported from
# .config/bashrc, which Replit's shell sources for Shell-tab sessions). This script is the fallback for any shell that
# does not get that variable: it turns ~/.claude and ~/.claude.json into links into the persistent dir, and it recreates
# the installer's launcher ~/.local/bin/claude. Run from .replit onBoot; safe to run repeatedly.
# Claude Code 2.1.260 writes through these links (its atomic writer resolves the link before renaming), so every piece
# of state persists in fallback mode too. Rules: the newer copy of a file wins on both sides (cp -u); nothing is deleted
# until its copy has succeeded; a copy failure leaves the original in place for manual recovery.
set -u
PERSIST="${CLAUDE_CONFIG_DIR:-/home/runner/workspace/.config/claude}"
HOME_DIR="${HOME:-/home/runner}"
status=0

if [ -e "$PERSIST" ] && [ ! -d "$PERSIST" ]; then
  echo "claude-persist: $PERSIST exists and is not a directory; nothing changed" >&2; exit 1
fi
mkdir -p "$PERSIST/projects" || { echo "claude-persist: cannot create $PERSIST; nothing changed" >&2; exit 1; }

same_path() { [ -n "$(readlink -f "$1" 2>/dev/null)" ] && [ "$(readlink -f "$1" 2>/dev/null)" = "$(readlink -f "$2" 2>/dev/null)" ]; }

link_dir() { # link_dir <ephemeral dir> <persistent dir>
  local src="$1" dst="$2" from
  same_path "$src" "$dst" && return 0
  if [ -L "$src" ]; then                        # a link from an older scheme: migrate from wherever it points
    from="$(readlink -f "$src")"
    echo "claude-persist: $src pointed at ${from:-a missing target}; re-pointing it" >&2
    if [ -n "$from" ] && [ -d "$from" ]; then
      cp -au "$from/." "$dst/" || { echo "claude-persist: copy from $from failed; link left alone" >&2; return 1; }
    fi
    ln -sfn "$dst" "$src"; return 0
  fi
  if [ -d "$src" ]; then                        # a real directory (e.g. this container already ran Claude)
    mv "$src" "$src.migrating" || { echo "claude-persist: cannot move $src; nothing changed" >&2; return 1; }
    ln -sfn "$dst" "$src"                       # new writes go to the persistent dir from here on
    if cp -au "$src.migrating/." "$dst/"; then
      rm -rf "$src.migrating"
    else
      echo "claude-persist: copy from $src.migrating failed; it is kept for manual recovery" >&2; return 1
    fi
  elif [ -e "$src" ]; then
    echo "claude-persist: $src is not a directory; nothing changed" >&2; return 1
  else
    ln -sfn "$dst" "$src"
  fi
}

link_file() { # link_file <ephemeral file> <persistent file>
  local src="$1" dst="$2" from
  same_path "$src" "$dst" && return 0
  if [ -L "$src" ]; then
    from="$(readlink -f "$src")"
    if [ -n "$from" ] && [ -f "$from" ]; then
      cp -au "$from" "$dst" || { echo "claude-persist: copy from $from failed; link left alone" >&2; return 1; }
    fi
    ln -sfn "$dst" "$src"; return 0
  fi
  if [ -f "$src" ]; then
    cp -au "$src" "$dst" || { echo "claude-persist: copy of $src failed; nothing changed" >&2; return 1; }
    rm -f "$src"
  elif [ -e "$src" ]; then
    echo "claude-persist: $src is not a regular file; nothing changed" >&2; return 1
  fi
  ln -sfn "$dst" "$src"
}

link_dir  "$HOME_DIR/.claude"      "$PERSIST"              || status=1
link_file "$HOME_DIR/.claude.json" "$PERSIST/.claude.json" || status=1
chmod 700 "$PERSIST" 2>/dev/null || true                    # cp -a can re-apply the source directory's mode
echo "claude-persist: $HOME_DIR/.claude -> $(readlink -f "$HOME_DIR/.claude")"

# The installer's launcher (~/.local/bin/claude) is also in the ephemeral home; recreate it so both paths work.
# Only real version names count: the installer stages downloads in the same folder as <version>.tmp.<pid>...
VERS="/home/runner/workspace/.local/share/claude/versions"
NEWEST="$(ls -1 "$VERS" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)"
if [ -n "$NEWEST" ]; then
  mkdir -p "$HOME_DIR/.local/bin"
  ln -sfn "$VERS/$NEWEST" "$HOME_DIR/.local/bin/claude"
  echo "claude-persist: $HOME_DIR/.local/bin/claude -> $VERS/$NEWEST"
fi
exit $status
