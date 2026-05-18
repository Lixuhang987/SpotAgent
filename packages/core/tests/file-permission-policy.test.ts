import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePermissionPolicy } from "../src/permission/FilePermissionPolicy.ts";

describe("FilePermissionPolicy", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "perm-policy-"));
    filePath = join(dir, "permissions.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns ask when no rule exists", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const decision = await policy.check({
      toolName: "file.write",
      arguments: { workspaceId: "default", relativePath: "x.md" },
      toolCallId: "tc-1",
    });
    expect(decision).toBe("ask");
  });

  it("session-scope rule survives within instance but not across instances", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const req = {
      toolName: "file.write",
      arguments: { workspaceId: "default", relativePath: "x.md" },
      toolCallId: "tc-1",
    };
    await policy.remember(req, { decision: "allow", remember: "session" });

    expect(await policy.check(req)).toBe("allow");

    const fresh = new FilePermissionPolicy({ filePath });
    expect(await fresh.check(req)).toBe("ask");
  });

  it("always-scope rule persists across instances and matches stable arg hash", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const req = {
      toolName: "file.write",
      arguments: { workspaceId: "default", relativePath: "x.md" },
      toolCallId: "tc-1",
    };
    await policy.remember(req, { decision: "allow", remember: "always" });

    const fresh = new FilePermissionPolicy({ filePath });
    expect(await fresh.check(req)).toBe("allow");
    expect(
      await fresh.check({
        ...req,
        arguments: { relativePath: "x.md", workspaceId: "default" },
      }),
    ).toBe("allow");
  });

  it("once-scope rule is not remembered", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const req = {
      toolName: "file.write",
      arguments: { workspaceId: "default" },
      toolCallId: "tc-1",
    };
    await policy.remember(req, { decision: "allow", remember: "once" });
    expect(await policy.check(req)).toBe("ask");
  });

  it("revoke removes a persisted rule", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const req = {
      toolName: "file.write",
      arguments: { workspaceId: "default" },
      toolCallId: "tc-1",
    };
    await policy.remember(req, { decision: "deny", remember: "always" });

    const rules = policy.listPersistedRules();
    expect(rules).toHaveLength(1);

    await policy.revoke(rules[0].argHash);
    expect(policy.listPersistedRules()).toHaveLength(0);
  });

  it("resolveAsk delegates to provided askResolver", async () => {
    const policy = new FilePermissionPolicy({
      filePath,
      askResolver: async () => ({ decision: "deny", reason: "user clicked deny" }),
    });
    const resolution = await policy.resolveAsk({
      toolName: "x",
      arguments: {},
      toolCallId: "tc-1",
    });
    expect(resolution).toEqual({ decision: "deny", reason: "user clicked deny" });
  });

  it("session-scope rules are isolated by sessionId", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const baseArgs = { workspaceId: "default", relativePath: "secret.md" };

    const reqA = {
      toolName: "file.write",
      arguments: baseArgs,
      sessionId: "session-A",
      toolCallId: "tc-a",
    };
    const reqB = {
      toolName: "file.write",
      arguments: baseArgs,
      sessionId: "session-B",
      toolCallId: "tc-b",
    };

    await policy.remember(reqA, { decision: "allow", remember: "session" });

    expect(await policy.check(reqA)).toBe("allow");
    expect(await policy.check(reqB)).toBe("ask");
  });

  it("clearSessionRules removes only rules for the given sessionId", async () => {
    const policy = new FilePermissionPolicy({ filePath });
    const baseArgs = { workspaceId: "default", relativePath: "x.md" };

    const reqA = {
      toolName: "file.write",
      arguments: baseArgs,
      sessionId: "session-A",
      toolCallId: "tc-a",
    };
    const reqB = {
      toolName: "file.write",
      arguments: baseArgs,
      sessionId: "session-B",
      toolCallId: "tc-b",
    };

    await policy.remember(reqA, { decision: "allow", remember: "session" });
    await policy.remember(reqB, { decision: "deny", remember: "session" });

    policy.clearSessionRules("session-A");

    expect(await policy.check(reqA)).toBe("ask");
    expect(await policy.check(reqB)).toBe("deny");
  });
});
