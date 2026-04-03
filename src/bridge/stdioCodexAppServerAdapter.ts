import path from "node:path";

import type {
  AdapterCapabilities,
  CodexAdapter,
  ReasoningEffortLevel,
  RuntimeAccessMode,
  RuntimeInfoResponse,
  SessionSummary,
  ThreadActivityEntry,
  ThreadDetail,
  ThreadFileChange,
  ThreadLiveEvent,
  ThreadMessage,
  ThreadSendRequest,
  ThreadSummary
} from "../shared/contracts";
import type { AppServerNotification, AppServerTransport } from "./stdioAppServerClient";
import { JsonRpcStdioTransport } from "./stdioAppServerClient";

interface StdioCodexAppServerAdapterOptions {
  cwd: string;
  transport?: AppServerTransport;
}

interface ThreadListThread {
  cwd: string;
  createdAt?: number;
  id: string;
  name: string | null;
  preview: string;
  source: string;
  status?: string | { type: string };
  updatedAt?: number;
}

interface ThreadReadThread {
  cwd?: string;
  createdAt?: number;
  id: string;
  name: string | null;
  preview: string;
  status?: string | { type: string };
  updatedAt?: number;
  turns: Array<{
    error?: { message?: string | null } | null;
    id?: string;
    items: Array<
      | {
          id?: string;
          phase?: string | null;
          type: "agentMessage";
          text: string;
        }
      | {
          durationMs?: number | null;
          aggregatedOutput?: string | null;
          command: string;
          cwd: string;
          exitCode?: number | null;
          id?: string;
          status?: string;
          type: "commandExecution";
        }
      | {
          changes: Array<{
            diff?: string;
            kind?: string;
            path: string;
          }>;
          id?: string;
          status?: string;
          type: "fileChange";
        }
      | {
          id?: string;
          text: string;
          type: "plan";
        }
      | {
          content?: string[];
          id?: string;
          summary?: string[];
          type: "reasoning";
        }
      | {
          durationMs?: number | null;
          error?: { message?: string | null } | null;
          id?: string;
          server: string;
          status?: string;
          tool: string;
          type: "mcpToolCall";
        }
      | {
          id?: string;
          type: "userMessage";
          content: Array<
            | {
                type: "text";
                text: string;
              }
            | {
                type: string;
              }
          >;
        }
      | {
          action?: {
            query?: string | null;
            type?: string;
            url?: string | null;
          } | null;
          id?: string;
          query: string;
          type: "webSearch";
        }
      | {
          type: string;
        }
    >;
    status?: string;
  }>;
}

interface ThreadListResponse {
  data: ThreadListThread[];
  nextCursor: string | null;
}

interface ThreadReadResponse {
  thread: ThreadReadThread;
}

type TextContentItem = {
  text: string;
  type: "text";
};

interface ModelListResponse {
  data: Array<{
    defaultReasoningEffort: ReasoningEffortLevel;
    description: string;
    displayName: string;
    hidden: boolean;
    id: string;
    isDefault: boolean;
    supportedReasoningEfforts: Array<{
      reasoningEffort: ReasoningEffortLevel;
    }>;
  }>;
  nextCursor: string | null;
}

interface AccountRateLimitsResponse {
  rateLimits: {
    credits: {
      balance: string;
      unlimited: boolean;
    } | null;
    limitName: string | null;
    planType: string | null;
    primary: {
      usedPercent: number;
    } | null;
    secondary: {
      usedPercent: number;
    } | null;
  } | null;
}

const capabilities: AdapterCapabilities = {
  supportsAttach: false,
  supportsSend: true,
  supportsStreaming: false,
  supportsWorkspaceHints: true
};

const TURN_POLL_INTERVAL_MS = 1000;
const TURN_POLL_TIMEOUT_MS = 120000;
const RUNTIME_ACCESS_MODES: RuntimeAccessMode[] = [
  "read-only",
  "workspace-write",
  "danger-full-access"
];

function normalizePath(value: string) {
  return value.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").toLowerCase();
}

function toAppServerCwd(value: string) {
  if (process.platform !== "win32") {
    return value;
  }

  return value.startsWith("\\\\?\\") ? value : `\\\\?\\${value}`;
}

function projectSessionId(projectRoot?: string) {
  return projectRoot ? `codex-app-server:${normalizePath(projectRoot)}` : "codex-app-server:all";
}

function pickThreadTitle(thread: { name: string | null; preview: string }) {
  return thread.name ?? thread.preview ?? "Untitled thread";
}

function messagesFromTurns(turns: ThreadReadThread["turns"]): ThreadMessage[] {
  const messages: ThreadMessage[] = [];

  for (const turn of turns) {
    for (const item of turn.items) {
      if (item.type === "agentMessage" && "text" in item) {
        messages.push({
          content: item.text,
          id: `${messages.length + 1}`,
          role: "assistant",
          turnId: turn.id ?? null
        });
      }

      if (item.type === "userMessage" && "content" in item) {
        const text = item.content
          .filter((entry): entry is TextContentItem => entry.type === "text")
          .map((entry) => entry.text)
          .join("\n");

        messages.push({
          content: text,
          id: `${messages.length + 1}`,
          role: "user",
          turnId: turn.id ?? null
        });
      }
    }
  }

  return messages;
}

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
  }

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function activitiesFromTurns(turns: ThreadReadThread["turns"]): ThreadActivityEntry[] {
  const activities: ThreadActivityEntry[] = [];

  for (const turn of turns) {
    for (const item of turn.items) {
      if (item.type === "commandExecution" && "command" in item) {
        const durationLabel = formatDuration(item.durationMs);
        activities.push({
          detail: item.aggregatedOutput ?? item.cwd,
          durationMs: item.durationMs ?? null,
          files: [],
          fileChanges: [],
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "command",
          status: item.status ?? null,
          title: durationLabel
            ? `Ran ${item.command} for ${durationLabel}`
            : `Ran ${item.command}`,
          turnId: turn.id ?? null
        });
      }

      if (item.type === "fileChange" && "changes" in item) {
        const fileChanges: ThreadFileChange[] = item.changes.map((change: { diff?: string; path: string }) => ({
          diff: typeof change.diff === "string" ? change.diff : null,
          path: change.path
        }));
        activities.push({
          detail:
            item.changes.length > 0
              ? item.changes.map((change: { path: string }) => change.path).join(", ")
              : null,
          durationMs: null,
          files: item.changes.map((change: { path: string }) => change.path),
          fileChanges,
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "file_change",
          status: item.status ?? null,
          title: `Updated ${item.changes.length} file${item.changes.length === 1 ? "" : "s"}`,
          turnId: turn.id ?? null
        });
      }

      if (item.type === "plan" && "text" in item) {
        activities.push({
          detail: item.text,
          durationMs: null,
          files: [],
          fileChanges: [],
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "plan",
          status: turn.status ?? null,
          title: "Updated plan",
          turnId: turn.id ?? null
        });
      }

      if (item.type === "reasoning" && ("summary" in item || "content" in item)) {
        activities.push({
          detail:
            item.summary?.join(" ") ??
            item.content?.join(" ") ??
            null,
          durationMs: null,
          files: [],
          fileChanges: [],
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "reasoning",
          status: turn.status ?? null,
          title: "Reasoning update",
          turnId: turn.id ?? null
        });
      }

      if (item.type === "mcpToolCall" && "server" in item && "tool" in item) {
        activities.push({
          detail: item.error?.message ?? null,
          durationMs: item.durationMs ?? null,
          files: [],
          fileChanges: [],
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "tool",
          status: item.status ?? null,
          title: `Used ${item.server}/${item.tool}`,
          turnId: turn.id ?? null
        });
      }

      if (item.type === "webSearch" && "query" in item) {
        activities.push({
          detail: item.action?.url ?? item.action?.query ?? item.query,
          durationMs: null,
          files: [],
          fileChanges: [],
          id: item.id ?? `activity-${activities.length + 1}`,
          itemId: item.id ?? null,
          kind: "web",
          status: turn.status ?? null,
          title: "Web research",
          turnId: turn.id ?? null
        });
      }
    }
  }

  return activities;
}

function mapThreadDetail(thread: ThreadReadThread): ThreadDetail {
  const activities = activitiesFromTurns(thread.turns);
  const messages = messagesFromTurns(thread.turns);

  return {
    activities,
    messageCount: messages.length,
    thread: {
      id: thread.id,
      mode: "mirrored",
      title: pickThreadTitle(thread),
      updatedAt: typeof thread.updatedAt === "number" ? new Date(thread.updatedAt * 1000).toISOString() : null
    },
    messages
  };
}

function getStatusType(status: ThreadReadThread["status"]) {
  if (!status) {
    return null;
  }

  return typeof status === "string" ? status : status.type;
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function approvalPolicyForAccessMode(accessMode: RuntimeAccessMode) {
  return accessMode === "danger-full-access" ? "never" : "on-request";
}

function sandboxModeForAccessMode(accessMode: RuntimeAccessMode) {
  switch (accessMode) {
    case "danger-full-access":
      return "danger-full-access";
    case "workspace-write":
      return "workspace-write";
    default:
      return "read-only";
  }
}

function sandboxPolicyForAccessMode(accessMode: RuntimeAccessMode, rootPath: string) {
  if (accessMode === "danger-full-access") {
    return {
      type: "dangerFullAccess"
    };
  }

  if (accessMode === "workspace-write") {
    return {
      excludeSlashTmp: false,
      excludeTmpdirEnvVar: false,
      networkAccess: false,
      readOnlyAccess: {
        type: "fullAccess"
      },
      type: "workspaceWrite",
      writableRoots: [rootPath]
    };
  }

  return {
    access: {
      type: "fullAccess"
    },
    networkAccess: false,
    type: "readOnly"
  };
}

function defaultTransport(cwd: string): AppServerTransport {
  return new JsonRpcStdioTransport({
    args: ["app-server", "--listen", "stdio://"],
    command:
      process.env.CODEXREMOTE_CODEX_BIN ??
      path.join(
        process.env.USERPROFILE ?? "",
        ".vscode",
        "extensions",
        "openai.chatgpt-26.325.31654-win32-x64",
        "bin",
        "windows-x86_64",
        "codex.exe"
      ),
    cwd
  });
}

function buildGroupId(threadId: string, turnId: string | null, itemId: string | null, fallback: string) {
  return `${threadId}:${turnId ?? "turn"}:${itemId ?? fallback}`;
}

export class StdioCodexAppServerAdapter implements CodexAdapter {
  readonly capabilities = capabilities;
  readonly label = "Codex app-server stdio adapter";
  readonly mode = "attached" as const;
  private initialized = false;
  private readonly listenersByThreadId = new Map<
    string,
    Set<(event: ThreadLiveEvent) => void>
  >();
  private readonly transport: AppServerTransport;

  constructor(private readonly options: StdioCodexAppServerAdapterOptions) {
    this.transport = options.transport ?? defaultTransport(options.cwd);
    this.transport.onNotification((notification) => {
      this.handleNotification(notification);
    });
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.transport.request("initialize", {
      capabilities: {
        experimentalApi: true
      },
      clientInfo: {
        name: "codexremote",
        title: "CodexRemote",
        version: "0.1.0"
      }
    });

    this.initialized = true;
  }

  async listSessions(projectRoot?: string): Promise<SessionSummary[]> {
    await this.initialize();

    return [
      {
        id: projectSessionId(projectRoot),
        title: projectRoot ? "Live Codex App Server" : "All Live Codex Threads",
        workspaceLabel: projectRoot ? path.basename(projectRoot) : "All workspaces"
      }
    ];
  }

  async listThreads(sessionId: string, projectRoot?: string): Promise<ThreadSummary[]> {
    await this.initialize();

    if (sessionId !== projectSessionId(projectRoot)) {
      return [];
    }

    const response = (await this.transport.request("thread/list", {
      archived: false,
      cwd: projectRoot ? toAppServerCwd(projectRoot) : null,
      limit: 100
    })) as ThreadListResponse;

    return [...response.data]
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .map((thread) => ({
        id: thread.id,
        mode: "mirrored",
        title: pickThreadTitle(thread),
        updatedAt:
          typeof thread.updatedAt === "number" ? new Date(thread.updatedAt * 1000).toISOString() : null
      }));
  }

  async getThread(threadId: string): Promise<ThreadDetail | null> {
    await this.initialize();

    const response = await this.readThread(threadId);

    if (!response.thread) {
      return null;
    }

    return mapThreadDetail(response.thread);
  }

  async getRuntimeInfo(): Promise<RuntimeInfoResponse> {
    await this.initialize();

    const [modelsResponse, usageResponse] = await Promise.all([
      this.transport.request("model/list", {
        limit: 50
      }) as Promise<ModelListResponse>,
      this.transport.request("account/rateLimits/read", undefined) as Promise<AccountRateLimitsResponse>
    ]);

    const visibleModels = modelsResponse.data.filter((model) => !model.hidden);
    const defaultModel =
      visibleModels.find((model) => model.isDefault) ?? visibleModels[0] ?? null;

    return {
      accessModes: RUNTIME_ACCESS_MODES,
      defaultAccessMode: "workspace-write",
      defaultModelId: defaultModel?.id ?? null,
      defaultReasoningEffort: defaultModel?.defaultReasoningEffort ?? null,
      models: visibleModels.map((model) => ({
        defaultReasoningEffort: model.defaultReasoningEffort,
        description: model.description,
        displayName: model.displayName,
        id: model.id,
        isDefault: model.isDefault,
        supportedReasoningEfforts: model.supportedReasoningEfforts.map(
          (effort) => effort.reasoningEffort
        )
      })),
      usage: usageResponse.rateLimits
        ? {
            creditsBalance: usageResponse.rateLimits.credits?.balance ?? null,
            creditsUnlimited: usageResponse.rateLimits.credits?.unlimited ?? false,
            limitName: usageResponse.rateLimits.limitName,
            planType: usageResponse.rateLimits.planType,
            primaryUsedPercent: usageResponse.rateLimits.primary?.usedPercent ?? null,
            secondaryUsedPercent: usageResponse.rateLimits.secondary?.usedPercent ?? null
          }
        : null
    };
  }

  subscribeToThreadEvents(
    threadId: string,
    listener: (event: ThreadLiveEvent) => void
  ) {
    const listeners = this.listenersByThreadId.get(threadId) ?? new Set();
    listeners.add(listener);
    this.listenersByThreadId.set(threadId, listeners);

    return () => {
      const nextListeners = this.listenersByThreadId.get(threadId);
      if (!nextListeners) {
        return;
      }

      nextListeners.delete(listener);

      if (nextListeners.size === 0) {
        this.listenersByThreadId.delete(threadId);
      }
    };
  }

  async sendMessage({
    accessMode = "workspace-write",
    message,
    model,
    projectRoot,
    reasoningEffort,
    threadId
  }: ThreadSendRequest): Promise<ThreadDetail> {
    await this.initialize();

    const activeThreadId = threadId
      ? await this.resumeThread(threadId, projectRoot, {
          accessMode,
          model
        })
      : await this.createThread(projectRoot, {
          accessMode,
          model
        });
    const response = (await this.transport.request("turn/start", {
      approvalPolicy: approvalPolicyForAccessMode(accessMode),
      effort: reasoningEffort ?? null,
      input: [
        {
          text: message,
          text_elements: [],
          type: "text"
        }
      ],
      model: model ?? null,
      sandboxPolicy: sandboxPolicyForAccessMode(
        accessMode,
        toAppServerCwd(projectRoot ?? this.options.cwd)
      ),
      threadId: activeThreadId
    })) as {
      turn?: {
        id?: string;
      };
    };

    return this.waitForTurnCompletion(activeThreadId, response.turn?.id ?? null);
  }

  close() {
    this.transport.close();
  }

  private async createThread(
    projectRoot?: string,
    settings?: {
      accessMode: RuntimeAccessMode;
      model?: string | null;
    }
  ) {
    const accessMode = settings?.accessMode ?? "workspace-write";
    const response = (await this.transport.request("thread/start", {
      approvalPolicy: approvalPolicyForAccessMode(accessMode),
      cwd: toAppServerCwd(projectRoot ?? this.options.cwd),
      ephemeral: false,
      experimentalRawEvents: false,
      model: settings?.model ?? null,
      persistExtendedHistory: true,
      sandbox: sandboxModeForAccessMode(accessMode)
    })) as {
      thread?: {
        id?: string;
      };
    };

    if (!response.thread?.id) {
      throw new Error("Codex app-server did not return a thread id.");
    }

    return response.thread.id;
  }

  private async resumeThread(
    threadId: string,
    projectRoot?: string,
    settings?: {
      accessMode: RuntimeAccessMode;
      model?: string | null;
    }
  ) {
    const accessMode = settings?.accessMode ?? "workspace-write";
    const response = (await this.transport.request("thread/resume", {
      approvalPolicy: approvalPolicyForAccessMode(accessMode),
      cwd: toAppServerCwd(projectRoot ?? this.options.cwd),
      model: settings?.model ?? null,
      persistExtendedHistory: true,
      sandbox: sandboxModeForAccessMode(accessMode),
      threadId
    })) as {
      thread?: {
        id?: string;
      };
    };

    if (!response.thread?.id) {
      throw new Error(`Codex app-server could not resume thread ${threadId}.`);
    }

    return response.thread.id;
  }

  private async readThread(threadId: string) {
    return (await this.transport.request("thread/read", {
      includeTurns: true,
      threadId
    })) as ThreadReadResponse;
  }

  private async waitForTurnCompletion(threadId: string, turnId: string | null) {
    const deadline = Date.now() + TURN_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const response = await this.readThread(threadId);
        const matchedTurn =
          response.thread.turns.find((turn) => (turnId ? turn.id === turnId : true)) ??
          response.thread.turns.at(-1);

        if (!matchedTurn) {
          await sleep(TURN_POLL_INTERVAL_MS);
          continue;
        }

        if (matchedTurn.status === "failed") {
          throw new Error(
            matchedTurn.error?.message ?? "Codex app-server reported a failed turn."
          );
        }

        if (
          matchedTurn.status === "completed" ||
          (matchedTurn.status === "inProgress" && getStatusType(response.thread.status) === "idle")
        ) {
          return mapThreadDetail(response.thread);
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("includeTurns is unavailable before first user message")
        ) {
          await sleep(TURN_POLL_INTERVAL_MS);
          continue;
        }

        throw error;
      }

      await sleep(TURN_POLL_INTERVAL_MS);
    }

    throw new Error("Timed out while waiting for the live Codex turn to complete.");
  }

  private emitThreadEvent(event: ThreadLiveEvent) {
    const listeners = this.listenersByThreadId.get(event.threadId);

    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  private handleNotification(notification: AppServerNotification) {
    const event = this.normalizeNotification(notification);
    if (!event) {
      return;
    }

    this.emitThreadEvent(event);
  }

  private normalizeNotification(notification: AppServerNotification): ThreadLiveEvent | null {
    const params = notification.params as Record<string, unknown>;
    const threadId = typeof params.threadId === "string" ? params.threadId : null;

    if (!threadId && notification.method !== "turn/started" && notification.method !== "turn/completed") {
      return null;
    }

    if (notification.method === "turn/started") {
      const turn = params.turn as { id?: string } | undefined;
      const turnId = turn?.id ?? null;
      return {
        detail: null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId ?? "", turnId, null, "turn"),
        id: `${threadId ?? "thread"}:${turnId ?? "turn"}:started`,
        itemId: null,
        kind: "turn_started",
        status: "inProgress",
        threadId: threadId ?? "",
        title: "Turn started",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "turn/completed") {
      const turn = params.turn as { id?: string } | undefined;
      const turnId = turn?.id ?? null;
      return {
        detail: null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId ?? "", turnId, null, "turn"),
        id: `${threadId ?? "thread"}:${turnId ?? "turn"}:completed`,
        itemId: null,
        kind: "turn_completed",
        status: "completed",
        threadId: threadId ?? "",
        title: "Turn completed",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (!threadId) {
      return null;
    }

    if (notification.method === "item/agentMessage/delta") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const itemId = typeof params.itemId === "string" ? params.itemId : null;
      return {
        detail: typeof params.delta === "string" ? params.delta : null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId, turnId, itemId, "agent"),
        id: `${threadId}:${String(params.itemId ?? "agent")}:delta`,
        itemId,
        kind: "agent_delta",
        status: "inProgress",
        threadId,
        title: "Assistant response streaming",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "item/plan/delta") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const itemId = typeof params.itemId === "string" ? params.itemId : null;
      return {
        detail: typeof params.delta === "string" ? params.delta : null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId, turnId, itemId, "plan"),
        id: `${threadId}:${String(params.itemId ?? "plan")}:delta`,
        itemId,
        kind: "plan_delta",
        status: "inProgress",
        threadId,
        title: "Plan update streaming",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "item/reasoning/textDelta") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const itemId = typeof params.itemId === "string" ? params.itemId : null;
      return {
        detail: typeof params.delta === "string" ? params.delta : null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId, turnId, itemId, "reasoning"),
        id: `${threadId}:${String(params.itemId ?? "reasoning")}:content`,
        itemId,
        kind: "reasoning_delta",
        status: "inProgress",
        threadId,
        title: "Reasoning streaming",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "item/reasoning/summaryTextDelta") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const itemId = typeof params.itemId === "string" ? params.itemId : null;
      return {
        detail: typeof params.delta === "string" ? params.delta : null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId, turnId, itemId, "reasoning-summary"),
        id: `${threadId}:${String(params.itemId ?? "reasoning")}:summary`,
        itemId,
        kind: "reasoning_summary_delta",
        status: "inProgress",
        threadId,
        title: "Reasoning summary streaming",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "item/fileChange/outputDelta") {
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      const itemId = typeof params.itemId === "string" ? params.itemId : null;
      return {
        detail: typeof params.delta === "string" ? params.delta : null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(threadId, turnId, itemId, "file-change"),
        id: `${threadId}:${String(params.itemId ?? "file-change")}:delta`,
        itemId,
        kind: "file_change_delta",
        status: "inProgress",
        threadId,
        title: "File change streaming",
        tokenUsageSummary: null,
        turnId
      };
    }

    if (notification.method === "thread/tokenUsage/updated") {
      const tokenUsage = params.tokenUsage as
        | {
            last?: {
              inputTokens?: number;
              outputTokens?: number;
              totalTokens?: number;
            };
          }
        | undefined;

      return {
        detail: null,
        files: [],
        fileChanges: [],
        groupId: buildGroupId(
          threadId,
          typeof params.turnId === "string" ? params.turnId : null,
          "token-usage",
          "token-usage"
        ),
        id: `${threadId}:${String(params.turnId ?? "turn")}:token-usage`,
        itemId: "token-usage",
        kind: "token_usage",
        status: null,
        threadId,
        title: "Token usage updated",
        tokenUsageSummary: tokenUsage?.last
          ? `${tokenUsage.last.totalTokens ?? 0} total · ${tokenUsage.last.inputTokens ?? 0} in · ${tokenUsage.last.outputTokens ?? 0} out`
          : null,
        turnId: typeof params.turnId === "string" ? params.turnId : null
      };
    }

    if (notification.method === "item/started" || notification.method === "item/completed") {
      const item = params.item as Record<string, unknown> | undefined;
      const itemType = typeof item?.type === "string" ? item.type : "item";
      const itemId = typeof item?.id === "string" ? item.id : "item";
      const isCompleted = notification.method === "item/completed";
      const turnId = typeof params.turnId === "string" ? params.turnId : null;
      let title = itemType;
      let detail: string | null = null;
      let files: string[] = [];
      let fileChanges: ThreadFileChange[] = [];

      if (itemType === "commandExecution" && typeof item?.command === "string") {
        const durationMs = typeof item.durationMs === "number" ? item.durationMs : null;
        title = durationMs
          ? `Ran ${item.command} for ${formatDuration(durationMs)}`
          : `Started ${item.command}`;
        detail =
          typeof item.aggregatedOutput === "string"
            ? item.aggregatedOutput
            : typeof item.cwd === "string"
              ? item.cwd
              : null;
      } else if (itemType === "fileChange" && Array.isArray(item?.changes)) {
        title = `Updated ${item.changes.length} file${item.changes.length === 1 ? "" : "s"}`;
        files = item.changes
          .map((change) =>
            typeof change === "object" && change && "path" in change ? String(change.path) : ""
          )
          .filter(Boolean);
        fileChanges = item.changes
          .map((change) =>
            typeof change === "object" && change && "path" in change
              ? {
                  diff:
                    "diff" in change && typeof change.diff === "string" ? change.diff : null,
                  path: String(change.path)
                }
              : null
          )
          .filter((change): change is ThreadFileChange => change !== null);
        detail = item.changes
          .map((change) =>
            typeof change === "object" && change && "path" in change ? String(change.path) : ""
          )
          .filter(Boolean)
          .join(", ");
      } else if (itemType === "plan" && typeof item?.text === "string") {
        title = "Plan update";
        detail = item.text;
      } else if (itemType === "reasoning") {
        title = "Reasoning update";
      } else if (itemType === "mcpToolCall") {
        title = `Used ${String(item?.server ?? "tool")}/${String(item?.tool ?? "call")}`;
      }

      return {
        detail,
        files,
        fileChanges,
        groupId: buildGroupId(threadId, turnId, itemId, itemType),
        id: `${threadId}:${itemId}:${isCompleted ? "completed" : "started"}`,
        itemId,
        kind: isCompleted ? "item_completed" : "item_started",
        status: isCompleted ? "completed" : "inProgress",
        threadId,
        title,
        tokenUsageSummary: null,
        turnId
      };
    }

    return null;
  }
}

export function createStdioCodexAppServerAdapter(options: StdioCodexAppServerAdapterOptions) {
  return new StdioCodexAppServerAdapter(options);
}
