import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { selectCodexAdapter } from "./selectCodexAdapter";

describe("selectCodexAdapter", () => {
  it("prefers the live local adapter when a codex state database exists", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codexremote-codex-select-"));
    await mkdir(codexHome, { recursive: true });
    const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, source TEXT NOT NULL, model_provider TEXT NOT NULL, cwd TEXT NOT NULL, title TEXT NOT NULL, sandbox_policy TEXT NOT NULL, approval_mode TEXT NOT NULL, tokens_used INTEGER NOT NULL DEFAULT 0, has_user_event INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, git_sha TEXT, git_branch TEXT, git_origin_url TEXT, cli_version TEXT NOT NULL DEFAULT '', first_user_message TEXT NOT NULL DEFAULT '', agent_nickname TEXT, agent_role TEXT, memory_mode TEXT NOT NULL DEFAULT 'enabled', model TEXT, reasoning_effort TEXT, agent_path TEXT);");
    db.close();

    const adapter = selectCodexAdapter({
      codexBin: "C:\\does-not-exist\\codex.exe",
      codexHome
    });

    expect(adapter.label).toBe("Local Codex state adapter");

    if ("close" in adapter && typeof adapter.close === "function") {
      adapter.close();
    }

    await rm(codexHome, { force: true, recursive: true });
  });

  it("falls back to the fixture adapter when local codex state is unavailable", () => {
    const adapter = selectCodexAdapter({
      codexBin: "C:\\does-not-exist\\codex.exe",
      codexHome: "C:\\does-not-exist\\codex"
    });

    expect(adapter.label).toBe("Fixture adapter");
  });
});
