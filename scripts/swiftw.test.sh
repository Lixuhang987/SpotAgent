#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP_DIR="$(mktemp -d -t swiftw-test.XXXXXX)"
FAKE_BIN_DIR="$TEST_TMP_DIR/bin"
CALLS_LOG="$TEST_TMP_DIR/calls.log"
TEMP_ROOT="$TEST_TMP_DIR/root"

cleanup() {
  rm -rf "$TEST_TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN_DIR"
mkdir -p "$TEMP_ROOT/scripts"
mkdir -p "$TEMP_ROOT/node_modules"

cat >"$FAKE_BIN_DIR/swift" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${SWIFTW_TEST_CALLS_LOG:-}" ]]; then
  printf 'swift %s\n' "$*" >>"$SWIFTW_TEST_CALLS_LOG"
fi

printf 'swift stdout for %s\n' "$*"
printf 'swift stderr for %s\n' "$*" >&2

if [[ "${SWIFTW_FAKE_FAIL:-0}" == "1" ]]; then
  exit 42
fi
EOF
chmod +x "$FAKE_BIN_DIR/swift"

cat >"$FAKE_BIN_DIR/pnpm" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${SWIFTW_TEST_CALLS_LOG:-}" ]]; then
  printf 'pnpm %s\n' "$*" >>"$SWIFTW_TEST_CALLS_LOG"
fi
EOF
chmod +x "$FAKE_BIN_DIR/pnpm"

cp "$ROOT_DIR/scripts/swiftw" "$TEMP_ROOT/scripts/swiftw"
chmod +x "$TEMP_ROOT/scripts/swiftw"

output="$(PATH="$FAKE_BIN_DIR:$PATH" "$TEMP_ROOT/scripts/swiftw" build 2>&1)"
if [[ "$output" != "success" ]]; then
  printf 'Expected successful build output to be exactly "success", got:\n%s\n' "$output" >&2
  exit 1
fi

set +e
failure_output="$(SWIFTW_FAKE_FAIL=1 PATH="$FAKE_BIN_DIR:$PATH" "$TEMP_ROOT/scripts/swiftw" build 2>&1)"
failure_status=$?
set -e

if [[ "$failure_status" -ne 42 ]]; then
  printf 'Expected failed build to exit 42, got %s\n' "$failure_status" >&2
  exit 1
fi

if [[ "$failure_output" != *"swift stdout for build"* ]] || [[ "$failure_output" != *"swift stderr for build"* ]]; then
  printf 'Expected failed build to print captured Swift output, got:\n%s\n' "$failure_output" >&2
  exit 1
fi

: >"$CALLS_LOG"
run_output="$(SWIFTW_TEST_CALLS_LOG="$CALLS_LOG" PATH="$FAKE_BIN_DIR:$PATH" "$TEMP_ROOT/scripts/swiftw" run HandAgentDesktop 2>&1)"

if [[ "$run_output" != *"swift stdout for run HandAgentDesktop"* ]] || [[ "$run_output" != *"swift stderr for run HandAgentDesktop"* ]]; then
  printf 'Expected run to pass through Swift output, got:\n%s\n' "$run_output" >&2
  exit 1
fi

expected_calls=$'pnpm --filter handagent-thread-window-web build\nswift run HandAgentDesktop'
actual_calls="$(cat "$CALLS_LOG")"
if [[ "$actual_calls" != "$expected_calls" ]]; then
  printf 'Expected run to build thread-window-web before swift run, got:\n%s\n' "$actual_calls" >&2
  exit 1
fi

: >"$CALLS_LOG"
rm -rf "$TEMP_ROOT/node_modules"
install_run_output="$(SWIFTW_TEST_CALLS_LOG="$CALLS_LOG" PATH="$FAKE_BIN_DIR:$PATH" "$TEMP_ROOT/scripts/swiftw" run HandAgentDesktop 2>&1)"

if [[ "$install_run_output" != *"[swiftw] node_modules missing, running pnpm install..."* ]]; then
  printf 'Expected missing node_modules message, got:\n%s\n' "$install_run_output" >&2
  exit 1
fi

expected_install_calls=$'pnpm install\npnpm --filter handagent-thread-window-web build\nswift run HandAgentDesktop'
actual_install_calls="$(cat "$CALLS_LOG")"
if [[ "$actual_install_calls" != "$expected_install_calls" ]]; then
  printf 'Expected run to install dependencies before web build, got:\n%s\n' "$actual_install_calls" >&2
  exit 1
fi

echo "success"
