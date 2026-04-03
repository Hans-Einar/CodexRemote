import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { createLocalCodexStateAdapter } from "./localCodexStateAdapter";

async function createCodexHomeFixture() {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codexremote-codex-home-"));
  await mkdir(path.join(codexHome, "sessions", "2026", "04", "02"), {
    recursive: true
  });

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT,
      cli_version TEXT NOT NULL DEFAULT '',
      first_user_message TEXT NOT NULL DEFAULT '',
      agent_nickname TEXT,
      agent_role TEXT,
      memory_mode TEXT NOT NULL DEFAULT 'enabled',
      model TEXT,
      reasoning_effort TEXT,
      agent_path TEXT
    );
  `);

  const rolloutPath = path.join(
    codexHome,
    "sessions",
    "2026",
    "04",
    "02",
    "rollout-2026-04-02T00-00-00-thread-live-1.jsonl"
  );

  db.prepare(
    `
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    "thread-live-1",
    rolloutPath,
    1775000000,
    1775000100,
    "vscode",
    "openai",
    "\\\\?\\C:\\Users\\hanse\\GIT\\CodexRemote",
    "Create CodexRemote SDP structure",
    "{\"type\":\"read-only\"}",
    "on-request"
  );

  db.close();

  await writeFile(
    path.join(codexHome, "session_index.jsonl"),
    JSON.stringify({
      id: "thread-live-1",
      thread_name: "Create CodexRemote SDP structure"
    }) + "\n",
    "utf8"
  );

  await writeFile(
    rolloutPath,
    [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "can you create the SDP structure?"
        }
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "I am inspecting the current mandate first."
        }
      })
    ].join("\n"),
    "utf8"
  );

  return codexHome;
}

describe("LocalCodexStateAdapter", () => {
  it("lists live local threads for a matching project root and parses rollout messages", async () => {
    const codexHome = await createCodexHomeFixture();
    const adapter = createLocalCodexStateAdapter({
      codexHome
    });

    const sessions = await adapter.listSessions("C:\\Users\\hanse\\GIT\\CodexRemote");
    expect(sessions).toEqual([
      expect.objectContaining({
        title: "Live Codex Threads"
      })
    ]);

    const threads = await adapter.listThreads(sessions[0].id, "C:\\Users\\hanse\\GIT\\CodexRemote");
    expect(threads).toEqual([
      expect.objectContaining({
        id: "thread-live-1",
        mode: "mirrored",
        title: "Create CodexRemote SDP structure"
      })
    ]);

    const detail = await adapter.getThread("thread-live-1");
    expect(detail?.messages).toEqual([
      expect.objectContaining({
        role: "user"
      }),
      expect.objectContaining({
        role: "assistant"
      })
    ]);

    adapter.close();
    await rm(codexHome, { force: true, recursive: true });
  });
});
