import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type {
  AdapterCapabilities,
  CodexAdapter,
  RuntimeInfoResponse,
  SessionSummary,
  ThreadDetail,
  ThreadMessage,
  ThreadSummary
} from "../shared/contracts";

interface LocalCodexStateAdapterOptions {
  codexHome: string;
}

interface ThreadRow {
  cwd: string;
  id: string;
  rollout_path: string;
  source: string;
  title: string;
  updated_at: number;
}

const capabilities: AdapterCapabilities = {
  supportsAttach: false,
  supportsSend: false,
  supportsStreaming: false,
  supportsWorkspaceHints: true
};

const runtimeInfo: RuntimeInfoResponse = {
  accessModes: ["read-only", "workspace-write", "danger-full-access"],
  defaultAccessMode: "workspace-write",
  defaultModelId: "gpt-5.4",
  defaultReasoningEffort: "medium",
  models: [
    {
      defaultReasoningEffort: "medium",
      description: "Latest frontier agentic coding model.",
      displayName: "gpt-5.4",
      id: "gpt-5.4",
      isDefault: true,
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"]
    }
  ],
  usage: null
};

function normalizeCodexPath(value: string) {
  return value.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").toLowerCase();
}

function normalizeProjectRoot(projectRoot?: string) {
  return projectRoot ? normalizeCodexPath(path.resolve(projectRoot)) : null;
}

function loadThreadNameIndex(codexHome: string) {
  const sessionIndexPath = path.join(codexHome, "session_index.jsonl");

  if (!existsSync(sessionIndexPath)) {
    return new Map<string, string>();
  }

  const lines = readFileSync(sessionIndexPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const index = new Map<string, string>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as {
        id?: string;
        thread_name?: string;
      };

      if (entry.id && entry.thread_name) {
        index.set(entry.id, entry.thread_name);
      }
    } catch {
      // Ignore malformed lines in the local index file.
    }
  }

  return index;
}

function parseMessagesFromRollout(rolloutPath: string): ThreadMessage[] {
  if (!existsSync(rolloutPath)) {
    return [];
  }

  const messages: ThreadMessage[] = [];
  const lines = readFileSync(rolloutPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        payload?: {
          message?: string;
          type?: string;
        };
        type?: string;
      };

      if (event.type !== "event_msg" || !event.payload?.type || !event.payload.message) {
        continue;
      }

      if (event.payload.type === "user_message") {
        messages.push({
          id: `${messages.length + 1}`,
          role: "user",
          content: event.payload.message
        });
      }

      if (event.payload.type === "agent_message") {
        messages.push({
          id: `${messages.length + 1}`,
          role: "assistant",
          content: event.payload.message
        });
      }
    } catch {
      // Ignore malformed event lines.
    }
  }

  return messages;
}

function sessionIdForProject(projectRoot?: string) {
  return projectRoot ? `local-codex:${normalizeCodexPath(projectRoot)}` : "local-codex:all";
}

function toIsoTimestamp(updatedAt: number) {
  return new Date(updatedAt * 1000).toISOString();
}

export class LocalCodexStateAdapter implements CodexAdapter {
  readonly capabilities = capabilities;
  readonly label = "Local Codex state adapter";
  readonly mode = "mirrored" as const;

  private readonly database: DatabaseSync;
  private readonly threadNameIndex: Map<string, string>;

  constructor(private readonly options: LocalCodexStateAdapterOptions) {
    this.database = new DatabaseSync(path.join(options.codexHome, "state_5.sqlite"), {
      readOnly: true
    });
    this.threadNameIndex = loadThreadNameIndex(options.codexHome);
  }

  static isAvailable(codexHome: string) {
    return existsSync(path.join(codexHome, "state_5.sqlite"));
  }

  close() {
    this.database.close();
  }

  private loadThreads(projectRoot?: string) {
    const rows = this.database
      .prepare(
        `
          SELECT id, cwd, title, rollout_path, updated_at, source
          FROM threads
          WHERE archived = 0
          ORDER BY updated_at DESC
        `
      )
      .all() as unknown as ThreadRow[];

    const normalizedProjectRoot = normalizeProjectRoot(projectRoot);

    return rows.filter((row) => {
      if (!normalizedProjectRoot) {
        return true;
      }

      return normalizeCodexPath(row.cwd).startsWith(normalizedProjectRoot);
    });
  }

  async listSessions(projectRoot?: string): Promise<SessionSummary[]> {
    const threads = this.loadThreads(projectRoot);

    if (threads.length === 0) {
      return [];
    }

    return [
      {
        id: sessionIdForProject(projectRoot),
        title: projectRoot ? "Live Codex Threads" : "All Local Codex Threads",
        workspaceLabel: projectRoot ? path.basename(projectRoot) : "All workspaces"
      }
    ];
  }

  async listThreads(sessionId: string, projectRoot?: string): Promise<ThreadSummary[]> {
    if (sessionId !== sessionIdForProject(projectRoot)) {
      return [];
    }

    return this.loadThreads(projectRoot).map((thread) => ({
      id: thread.id,
      mode: "mirrored",
      title: this.threadNameIndex.get(thread.id) ?? thread.title,
      updatedAt: toIsoTimestamp(thread.updated_at)
    }));
  }

  async getThread(threadId: string): Promise<ThreadDetail | null> {
    const row = this.database
      .prepare(
        `
          SELECT id, cwd, title, rollout_path, updated_at, source
          FROM threads
          WHERE id = ?
        `
      )
      .get(threadId) as unknown as ThreadRow | undefined;

    if (!row) {
      return null;
    }

    const messages = parseMessagesFromRollout(row.rollout_path);

    return {
      activities: [],
      messageCount: messages.length,
      thread: {
        id: row.id,
        mode: "mirrored",
        title: this.threadNameIndex.get(row.id) ?? row.title,
        updatedAt: toIsoTimestamp(row.updated_at)
      },
      messages
    };
  }

  async getRuntimeInfo(): Promise<RuntimeInfoResponse> {
    return runtimeInfo;
  }

  subscribeToThreadEvents() {
    return () => {
      // noop for local mirror adapter
    };
  }

  async sendMessage(): Promise<ThreadDetail> {
    throw new Error(
      "Live send is unavailable while CodexRemote is using the local Codex state adapter."
    );
  }
}

export function createLocalCodexStateAdapter(options: LocalCodexStateAdapterOptions) {
  return new LocalCodexStateAdapter(options);
}
