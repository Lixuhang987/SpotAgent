#!/usr/bin/env bash
set -euo pipefail

APP_NAME="HandAgentDesktop"
BUNDLE_ID="com.yourname.HandAgentDesktop"
BUILD_DIR=".build/release"
DIST_DIR="dist"
APP_DIR="$DIST_DIR/$APP_NAME.app"

swift build -c release --product "$APP_NAME"

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

# 本地 QA 用 ad-hoc 签名即可。正式分发再换 Developer ID。
codesign --force --deep --sign - "$APP_DIR"

echo "Built: $APP_DIR"
