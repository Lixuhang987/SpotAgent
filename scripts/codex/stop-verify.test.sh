#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

source_with_test_mode() {
  (
    export STOP_VERIFY_TEST_MODE=1
    cd "$1"
    source "$PROJECT_ROOT/scripts/codex/stop-verify.sh"
    resolve_root_dir
  )
}

git init "$TMP_DIR/repo" >/dev/null 2>&1
touch "$TMP_DIR/repo/.gitignore"
git -C "$TMP_DIR/repo" add .gitignore >/dev/null 2>&1
git -C "$TMP_DIR/repo" -c user.name='Codex' -c user.email='codex@example.com' commit -m init >/dev/null 2>&1
mkdir -p "$TMP_DIR/repo/.worktrees/demo"
git -C "$TMP_DIR/repo" worktree add "$TMP_DIR/repo/.worktrees/demo" -b test-hook-root >/dev/null 2>&1

resolved_root="$(source_with_test_mode "$TMP_DIR/repo/.worktrees/demo")"
expected_root="$(cd "$TMP_DIR/repo/.worktrees/demo" && pwd -P)"

if [ "$resolved_root" != "$expected_root" ]; then
  echo "expected worktree root $expected_root, got $resolved_root" >&2
  exit 1
fi

echo "stop-verify root resolution ok"
