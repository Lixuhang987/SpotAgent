#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP_DIR="$(mktemp -d -t package-app-test.XXXXXX)"
FAKE_BIN_DIR="$TEST_TMP_DIR/bin"
BUILD_DIR="$TEST_TMP_DIR/build/release"
DIST_DIR="$TEST_TMP_DIR/dist"
LOG_FILE="$TEST_TMP_DIR/calls.log"

cleanup() {
  rm -rf "$TEST_TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN_DIR" "$BUILD_DIR"

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
EOF
chmod +x "$FAKE_BIN_DIR/swift"

cat >"$FAKE_BIN_DIR/codesign" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'codesign:%s\n' "$*" >>"$HANDAGENT_PACKAGE_LOG_FILE"
EOF
chmod +x "$FAKE_BIN_DIR/codesign"

HANDAGENT_PACKAGE_SWIFT_BIN="$FAKE_BIN_DIR/swift" \
HANDAGENT_PACKAGE_CODESIGN_BIN="$FAKE_BIN_DIR/codesign" \
HANDAGENT_PACKAGE_BUILD_DIR="$BUILD_DIR" \
HANDAGENT_PACKAGE_DIST_DIR="$DIST_DIR" \
HANDAGENT_PACKAGE_LOG_FILE="$LOG_FILE" \
"$ROOT_DIR/scripts/package-app.sh" --mock-llm >/dev/null

APP_DIR="$DIST_DIR/HandAgentDesktop.app"
MARKER_FILE="$APP_DIR/Contents/Resources/HandAgentRuntimeMode.json"

test -x "$APP_DIR/Contents/MacOS/HandAgentDesktop"
test -f "$MARKER_FILE"
grep -q '"llmMode":"mock"' "$MARKER_FILE"
grep -q 'swift:build -c release --product HandAgentDesktop' "$LOG_FILE"
grep -q 'codesign:--force --deep --sign - --requirements =designated => identifier "com.yourname.HandAgentDesktop"' "$LOG_FILE"

rm -rf "$DIST_DIR"
: >"$LOG_FILE"

HANDAGENT_PACKAGE_SWIFT_BIN="$FAKE_BIN_DIR/swift" \
HANDAGENT_PACKAGE_CODESIGN_BIN="$FAKE_BIN_DIR/codesign" \
HANDAGENT_PACKAGE_BUILD_DIR="$BUILD_DIR" \
HANDAGENT_PACKAGE_DIST_DIR="$DIST_DIR" \
HANDAGENT_PACKAGE_LOG_FILE="$LOG_FILE" \
"$ROOT_DIR/scripts/package-app.sh" >/dev/null

test -x "$APP_DIR/Contents/MacOS/HandAgentDesktop"
test ! -f "$MARKER_FILE"
grep -q 'swift:build -c release --product HandAgentDesktop' "$LOG_FILE"
grep -q 'codesign:--force --deep --sign - --requirements =designated => identifier "com.yourname.HandAgentDesktop"' "$LOG_FILE"

echo "success"
