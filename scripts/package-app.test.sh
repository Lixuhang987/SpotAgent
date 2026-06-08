#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP_DIR="$(mktemp -d -t package-app-test.XXXXXX)"
FAKE_BIN_DIR="$TEST_TMP_DIR/bin"
BUILD_DIR="$TEST_TMP_DIR/build/release"
DIST_DIR="$TEST_TMP_DIR/dist"
WEB_DIST_DIR="$TEST_TMP_DIR/thread-window-web-dist"
ELECTRON_SHELL_DIST_DIR="$TEST_TMP_DIR/electron-shell-dist"
PACKAGE_ROOT_DIR="$TEST_TMP_DIR/package-root"
LOG_FILE="$TEST_TMP_DIR/calls.log"
COMMON_GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-common-dir)"
if [[ "$COMMON_GIT_DIR" != /* ]]; then
  COMMON_GIT_DIR="$ROOT_DIR/$COMMON_GIT_DIR"
fi
SHARED_CACHE_ROOT="$(cd "$(dirname "$COMMON_GIT_DIR")" && pwd)"

cleanup() {
  rm -rf "$TEST_TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN_DIR" "$BUILD_DIR" "$WEB_DIST_DIR" "$ELECTRON_SHELL_DIST_DIR/main" "$PACKAGE_ROOT_DIR"

cat >"$WEB_DIST_DIR/index.html" <<'HTML'
<!doctype html>
<html>
  <body>mock web</body>
</html>
HTML

cat >"$ELECTRON_SHELL_DIST_DIR/main/main.js" <<'JS'
console.log("mock electron shell");
JS

cat >"$FAKE_BIN_DIR/swift" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HANDAGENT_PACKAGE_BUILD_DIR"
cat >"$HANDAGENT_PACKAGE_BUILD_DIR/HandAgentDesktop" <<'APP'
#!/usr/bin/env bash
echo mock app
APP
chmod +x "$HANDAGENT_PACKAGE_BUILD_DIR/HandAgentDesktop"
printf 'swift:%s\n' "$*" >>"$HANDAGENT_PACKAGE_LOG_FILE"
printf 'clang_cache:%s\n' "${CLANG_MODULE_CACHE_PATH:-}" >>"$HANDAGENT_PACKAGE_LOG_FILE"
printf 'swift_cache:%s\n' "${SWIFT_MODULECACHE_PATH:-}" >>"$HANDAGENT_PACKAGE_LOG_FILE"
EOF
chmod +x "$FAKE_BIN_DIR/swift"

cat >"$FAKE_BIN_DIR/codesign" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'codesign:%s\n' "$*" >>"$HANDAGENT_PACKAGE_LOG_FILE"
EOF
chmod +x "$FAKE_BIN_DIR/codesign"

cat >"$FAKE_BIN_DIR/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'pnpm:%s\n' "$*" >>"$HANDAGENT_PACKAGE_LOG_FILE"
if [[ "$*" == "install" ]]; then
  mkdir -p "$HANDAGENT_PACKAGE_ROOT_DIR/node_modules"
fi
mkdir -p "$HANDAGENT_PACKAGE_ROOT_DIR/apps/thread-window-web/dist"
cat >"$HANDAGENT_PACKAGE_ROOT_DIR/apps/thread-window-web/dist/index.html" <<'HTML'
<!doctype html><html><body>built web</body></html>
HTML
mkdir -p "$HANDAGENT_PACKAGE_ROOT_DIR/apps/electron-shell/dist/main"
cat >"$HANDAGENT_PACKAGE_ROOT_DIR/apps/electron-shell/dist/main/main.js" <<'JS'
console.log("built electron shell");
JS
EOF
chmod +x "$FAKE_BIN_DIR/pnpm"

HANDAGENT_PACKAGE_SWIFT_BIN="$FAKE_BIN_DIR/swift" \
HANDAGENT_PACKAGE_CODESIGN_BIN="$FAKE_BIN_DIR/codesign" \
HANDAGENT_PACKAGE_BUILD_DIR="$BUILD_DIR" \
HANDAGENT_PACKAGE_DIST_DIR="$DIST_DIR" \
HANDAGENT_THREAD_WINDOW_WEB_DIST_DIR="$WEB_DIST_DIR" \
HANDAGENT_ELECTRON_SHELL_DIST_DIR="$ELECTRON_SHELL_DIST_DIR" \
HANDAGENT_PACKAGE_LOG_FILE="$LOG_FILE" \
"$ROOT_DIR/scripts/package-app.sh" --mock-llm >/dev/null

APP_DIR="$DIST_DIR/HandAgentDesktop.app"
MARKER_FILE="$APP_DIR/Contents/Resources/HandAgentRuntimeMode.json"
ELECTRON_MAIN_FILE="$APP_DIR/Contents/Resources/ElectronShell/dist/main/main.js"

test -x "$APP_DIR/Contents/MacOS/HandAgentDesktop"
test -f "$MARKER_FILE"
test -f "$APP_DIR/Contents/Resources/ThreadWindowWeb/index.html"
test -f "$ELECTRON_MAIN_FILE"
grep -q '"llmMode":"mock"' "$MARKER_FILE"
grep -q 'mock web' "$APP_DIR/Contents/Resources/ThreadWindowWeb/index.html"
grep -q 'mock electron shell' "$ELECTRON_MAIN_FILE"
grep -q "swift:build --cache-path $SHARED_CACHE_ROOT/.cache/swiftpm -c release --product HandAgentDesktop" "$LOG_FILE"
grep -q "clang_cache:$ROOT_DIR/.cache/swift/clang-module-cache" "$LOG_FILE"
grep -q "swift_cache:$ROOT_DIR/.cache/swift/swift-module-cache" "$LOG_FILE"
grep -q 'codesign:--force --deep --sign - --requirements =designated => identifier "com.yourname.HandAgentDesktop"' "$LOG_FILE"

rm -rf "$DIST_DIR"
: >"$LOG_FILE"

package_output="$(
  PATH="$FAKE_BIN_DIR:$PATH" \
    HANDAGENT_PACKAGE_SWIFT_BIN="$FAKE_BIN_DIR/swift" \
    HANDAGENT_PACKAGE_CODESIGN_BIN="$FAKE_BIN_DIR/codesign" \
    HANDAGENT_PACKAGE_BUILD_DIR="$BUILD_DIR" \
    HANDAGENT_PACKAGE_DIST_DIR="$DIST_DIR" \
    HANDAGENT_PACKAGE_ROOT_DIR="$PACKAGE_ROOT_DIR" \
    HANDAGENT_SWIFTPM_CACHE_DIR="$TEST_TMP_DIR/shared-swiftpm-cache" \
    HANDAGENT_SWIFT_MODULE_CACHE_DIR="$TEST_TMP_DIR/shared-module-cache" \
    HANDAGENT_PACKAGE_LOG_FILE="$LOG_FILE" \
    "$ROOT_DIR/scripts/package-app.sh"
)"

test -x "$APP_DIR/Contents/MacOS/HandAgentDesktop"
test ! -f "$MARKER_FILE"
test -f "$APP_DIR/Contents/Resources/ThreadWindowWeb/index.html"
test -f "$ELECTRON_MAIN_FILE"
grep -q 'built web' "$APP_DIR/Contents/Resources/ThreadWindowWeb/index.html"
grep -q 'built electron shell' "$ELECTRON_MAIN_FILE"
grep -q 'pnpm:install' "$LOG_FILE"
grep -q 'pnpm:--filter handagent-thread-window-web build' "$LOG_FILE"
grep -q 'pnpm:--filter handagent-electron-shell build' "$LOG_FILE"
grep -q "swift:build --cache-path $TEST_TMP_DIR/shared-swiftpm-cache -c release --product HandAgentDesktop" "$LOG_FILE"
grep -q "clang_cache:$TEST_TMP_DIR/shared-module-cache/clang-module-cache" "$LOG_FILE"
grep -q "swift_cache:$TEST_TMP_DIR/shared-module-cache/swift-module-cache" "$LOG_FILE"
grep -q 'codesign:--force --deep --sign - --requirements =designated => identifier "com.yourname.HandAgentDesktop"' "$LOG_FILE"

if [[ "$package_output" != *"[package-app] node_modules missing, running pnpm install..."* ]] ||
  [[ "$package_output" != *"[package-app] Building thread-window-web..."* ]] ||
  [[ "$package_output" != *"[package-app] Building electron-shell..."* ]] ||
  [[ "$package_output" != *"[package-app] Building HandAgentDesktop release binary..."* ]] ||
  [[ "$package_output" != *"[package-app] Code signing app bundle..."* ]] ||
  [[ "$package_output" != *"success"* ]]; then
  printf 'Expected package-app progress output, got:\n%s\n' "$package_output" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
rm -rf "$ELECTRON_SHELL_DIST_DIR"
: >"$LOG_FILE"

if PATH="$FAKE_BIN_DIR:$PATH" \
  HANDAGENT_PACKAGE_SWIFT_BIN="$FAKE_BIN_DIR/swift" \
  HANDAGENT_PACKAGE_CODESIGN_BIN="$FAKE_BIN_DIR/codesign" \
  HANDAGENT_PACKAGE_BUILD_DIR="$BUILD_DIR" \
  HANDAGENT_PACKAGE_DIST_DIR="$DIST_DIR" \
  HANDAGENT_THREAD_WINDOW_WEB_DIST_DIR="$WEB_DIST_DIR" \
  HANDAGENT_ELECTRON_SHELL_DIST_DIR="$ELECTRON_SHELL_DIST_DIR" \
  HANDAGENT_PACKAGE_LOG_FILE="$LOG_FILE" \
  "$ROOT_DIR/scripts/package-app.sh" >"$TEST_TMP_DIR/missing-electron.log" 2>&1; then
  printf 'Expected package-app to fail when ElectronShell dist/main/main.js is missing.\n' >&2
  exit 1
fi

grep -q 'Missing ElectronShell build:' "$TEST_TMP_DIR/missing-electron.log"

echo "success"
