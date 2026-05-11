import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  FrontmostAppInfo,
  OCRRequest,
  OCRResult,
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
  WindowInfo,
} from "../../core/src/platform/PlatformAdapter";

const execFileAsync = promisify(execFile);

export class MacPlatformAdapter implements PlatformAdapter {
  async currentClipboardText(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("pbpaste");
      const text = stdout.toString();
      return text === "" ? null : text;
    } catch (error) {
      throw new Error(`Unable to read clipboard: ${formatError(error)}`);
    }
  }

  async frontmostAppInfo(): Promise<FrontmostAppInfo> {
    try {
      const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const name = stdout.toString().trim();

      return {
        name: name || null,
        bundleId: undefined,
        pid: undefined,
        resolution: "best_effort",
      };
    } catch (error) {
      throw new Error(`Unable to read frontmost app: ${formatError(error)}`);
    }
  }

  async frontmostWindowList(): Promise<WindowInfo[]> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set outputLines to {}
        repeat with w in windows of frontApp
          set end of outputLines to (name of w)
        end repeat
        set AppleScript's text item delimiters to linefeed
        return appName & linefeed & (outputLines as text)
      end tell
    `;

    try {
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const raw = stdout.toString();

      if (raw === "") {
        return [];
      }

      const [appName, ...titles] = raw.split(/\r?\n/).filter((line) => line !== "");
      return titles.map((title) => ({
        title: title || null,
        appName: appName || null,
      }));
    } catch (error) {
      throw new Error(`Unable to read frontmost windows: ${formatError(error)}`);
    }
  }

  async captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult> {
    const target = request.target;

    if (target?.kind === "window") {
      throw new Error("Window-targeted screen capture is not implemented yet on macOS");
    }

    const screenshotDir = await mkdtemp(join(tmpdir(), "handagent-screen-"));
    const screenshotPath = join(screenshotDir, "capture.png");
    const args = buildScreenCaptureArgs(target, screenshotPath);

    try {
      await execFileAsync("screencapture", args);
      const imageBuffer = await readFile(screenshotPath);

      return {
        imageBase64: imageBuffer.toString("base64"),
        mimeType: "image/png",
        target,
        resolution: "best_effort",
      };
    } catch (error) {
      throw new Error(`Unable to capture screen: ${formatError(error)}`);
    } finally {
      await rm(screenshotDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async recognizeText(_request: OCRRequest): Promise<OCRResult> {
    throw new Error("OCR is not implemented yet on macOS");
  }

  async accessibilitySnapshot(_target: AccessibilitySnapshotTarget): Promise<AccessibilityNodeSnapshot> {
    throw new Error("Accessibility snapshot is not implemented yet on macOS");
  }

  async performAccessibilityAction(_request: AccessibilityActionRequest): Promise<AccessibilityActionResult> {
    throw new Error("Accessibility action is not implemented yet on macOS");
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildScreenCaptureArgs(target: ScreenCaptureRequest["target"], outputPath: string): string[] {
  const args = ["-x", "-t", "png"];

  if (target?.kind === "region") {
    args.push("-R", `${target.x},${target.y},${target.width},${target.height}`);
  }

  args.push(outputPath);
  return args;
}
