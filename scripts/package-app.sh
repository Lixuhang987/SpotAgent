#!/usr/bin/env bash
set -euo pipefail

APP_NAME="HandAgentDesktop"
BUNDLE_ID="com.yourname.HandAgentDesktop"
BUILD_DIR="${HANDAGENT_PACKAGE_BUILD_DIR:-.build/release}"
DIST_DIR="${HANDAGENT_PACKAGE_DIST_DIR:-dist}"
APP_DIR="$DIST_DIR/$APP_NAME.app"
SWIFT_BIN="${HANDAGENT_PACKAGE_SWIFT_BIN:-swift}"
CODESIGN_BIN="${HANDAGENT_PACKAGE_CODESIGN_BIN:-codesign}"
CODESIGN_IDENTITY="${HANDAGENT_PACKAGE_CODESIGN_IDENTITY:--}"
CODESIGN_REQUIREMENT="${HANDAGENT_PACKAGE_CODESIGN_REQUIREMENT:-=designated => identifier \"$BUNDLE_ID\"}"
MOCK_LLM=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mock-llm)
      MOCK_LLM=1
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: bash ./scripts/package-app.sh [--mock-llm]

Options:
  --mock-llm  Package the app with a bundle marker that starts agent-server in MockLLMClient mode.
EOF
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

tmp_log="$(mktemp -t "package-app.XXXXXX")"
trap 'rm -f "$tmp_log"' EXIT

if ! "$SWIFT_BIN" build -c release --product "$APP_NAME" >"$tmp_log" 2>&1; then
  cat "$tmp_log"
  exit 1
fi

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$BUILD_DIR/$APP_NAME" "$APP_DIR/Contents/MacOS/$APP_NAME"
chmod +x "$APP_DIR/Contents/MacOS/$APP_NAME"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>

  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>

  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>

  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>

  <key>CFBundlePackageType</key>
  <string>APPL</string>

  <key>CFBundleVersion</key>
  <string>1</string>

  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>

  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>

  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

if [[ "$MOCK_LLM" == "1" ]]; then
  cat > "$APP_DIR/Contents/Resources/HandAgentRuntimeMode.json" <<'JSON'
{"llmMode":"mock"}
JSON
fi

# 本地 QA 默认使用 ad-hoc 签名，但显式写入稳定 designated requirement。
# 否则默认 requirement 会退化为 cdhash，重构建后二进制 hash 改变，macOS TCC 会把它视为新 App。
"$CODESIGN_BIN" \
  --force \
  --deep \
  --sign "$CODESIGN_IDENTITY" \
  --requirements "$CODESIGN_REQUIREMENT" \
  "$APP_DIR" >/dev/null 2>&1

echo "success"
