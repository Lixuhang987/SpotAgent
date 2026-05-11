import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  selectionResultFromText,
  type SelectionCapture,
  type SelectionCaptureResult,
} from "../../core/src/selection/SelectionCapture";

const execFileAsync = promisify(execFile);

export const COPY_SELECTION_SCRIPT = `tell application "System Events" to keystroke "c" using command down`;

export type MacSelectionCaptureDependencies = {
  runAppleScript?: (script: string) => Promise<void>;
  readClipboard?: () => Promise<string>;
  writeClipboard?: (value: string) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  waitMs?: number;
};

export class MacSelectionCapture implements SelectionCapture {
  constructor(private readonly dependencies: MacSelectionCaptureDependencies = {}) {}

  async captureSelectedText(): Promise<SelectionCaptureResult> {
    const originalClipboard = await this.readClipboard().catch(() => null);

    try {
      await this.runAppleScript(COPY_SELECTION_SCRIPT);
      await this.sleep(this.dependencies.waitMs ?? 120);
      return selectionResultFromText(await this.readClipboard());
    } catch {
      return { kind: "error" };
    } finally {
      if (originalClipboard != null) {
        await this.writeClipboard(originalClipboard).catch(() => undefined);
      }
    }
  }

  private async runAppleScript(script: string): Promise<void> {
    if (this.dependencies.runAppleScript) {
      await this.dependencies.runAppleScript(script);
      return;
    }

    await execFileAsync("osascript", ["-e", script]);
  }

  private async readClipboard(): Promise<string> {
    if (this.dependencies.readClipboard) {
      return this.dependencies.readClipboard();
    }

    const { stdout } = await execFileAsync("pbpaste");
    return stdout.toString();
  }

  private async writeClipboard(value: string): Promise<void> {
    if (this.dependencies.writeClipboard) {
      await this.dependencies.writeClipboard(value);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn("pbcopy");

      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`pbcopy exited with code ${code ?? "unknown"}`));
      });

      child.stdin.end(value);
    });
  }

  private async sleep(milliseconds: number): Promise<void> {
    if (this.dependencies.sleep) {
      await this.dependencies.sleep(milliseconds);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
