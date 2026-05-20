import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../..", import.meta.url).pathname;

describe("agent-server core imports", () => {
  it("uses the @handagent/core workspace alias instead of reaching across packages with relative paths", () => {
    const sourceFiles = listTypeScriptFiles(join(repoRoot, "apps/agent-server/src"))
      .filter((file) => !file.endsWith("path-alias.test.ts"));
    const offenders = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes("../../../packages/core"),
    );

    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return listTypeScriptFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
