import type {
  AdapterCapabilities,
  CodexAdapter,
  RuntimeInfoResponse,
  SessionSummary,
  ThreadDetail,
  ThreadSummary
} from "../shared/contracts";

const capabilities: AdapterCapabilities = {
  supportsAttach: false,
  supportsSend: true,
  supportsStreaming: false,
  supportsWorkspaceHints: false
};

const sessions: SessionSummary[] = [
  {
    id: "session-local-companion",
    title: "Local Companion Baseline",
    workspaceLabel: "CodexRemote"
  }
];

const threadsBySession = new Map<string, ThreadSummary[]>([
  [
    "session-local-companion",
    [
      {
        id: "thread-bridge-bootstrap",
        mode: "fallback",
        title: "Bridge bootstrap",
        updatedAt: "2026-04-02T09:00:00.000Z"
      },
      {
        id: "thread-ui-shell",
        mode: "fallback",
        title: "UI shell",
        updatedAt: "2026-04-02T08:30:00.000Z"
      }
    ]
  ]
]);

const threadDetails = new Map<string, ThreadDetail>([
  [
    "thread-bridge-bootstrap",
    {
      activities: [
        {
          detail: "Bridge shell inspection completed.",
          durationMs: 1000,
          files: [],
          fileChanges: [],
          id: "activity-bootstrap-1",
          itemId: "activity-bootstrap-1",
          kind: "command",
          status: "completed",
          title: "Ran Get-Content -Path README.md",
          turnId: "turn-bootstrap"
        }
      ],
      messageCount: 2,
      thread: {
        id: "thread-bridge-bootstrap",
        mode: "fallback",
        title: "Bridge bootstrap"
      },
      messages: [
        {
          id: "message-system-bootstrap",
          role: "system",
          content: "Fixture adapter is active until a real local Codex surface is wired in.",
          turnId: "turn-bootstrap"
        },
        {
          id: "message-assistant-bootstrap",
          role: "assistant",
          content:
            "Bridge shell is in place. First boot should show sessions, threads, and workspace files.",
          turnId: "turn-bootstrap"
        }
      ]
    }
  ],
  [
    "thread-ui-shell",
    {
      activities: [
        {
          detail: "Shell composition baseline drafted.",
          durationMs: null,
          files: [],
          fileChanges: [],
          id: "activity-ui-1",
          itemId: "activity-ui-1",
          kind: "plan",
          status: "completed",
          title: "Planned UI shell refinements",
          turnId: "turn-ui"
        }
      ],
      messageCount: 1,
      thread: {
        id: "thread-ui-shell",
        mode: "fallback",
        title: "UI shell"
      },
      messages: [
        {
          id: "message-assistant-ui",
          role: "assistant",
          content: "The shell should feel calm and operational.",
          turnId: "turn-ui"
        }
      ]
    }
  ]
]);

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

export function createFixtureCodexAdapter(): CodexAdapter {
  return {
    label: "Fixture adapter",
    mode: "fallback",
    capabilities,
    async listSessions() {
      return sessions;
    },
    async listThreads(sessionId) {
      return threadsBySession.get(sessionId) ?? [];
    },
    async getThread(threadId) {
      return threadDetails.get(threadId) ?? null;
    },
    async getRuntimeInfo() {
      return runtimeInfo;
    },
    subscribeToThreadEvents() {
      return () => {
        // noop for fixture adapter
      };
    },
    async sendMessage({ message, threadId }) {
      const targetThreadId = threadId ?? "thread-live-compose";
      const existingDetail = threadDetails.get(targetThreadId);
      const timestamp = new Date().toISOString();

      if (!existingDetail) {
        const title = message.trim().slice(0, 48) || "New thread";
        const nextThread = {
          id: targetThreadId,
          mode: "fallback" as const,
          title,
          updatedAt: timestamp
        };

        threadsBySession.set("session-local-companion", [
          nextThread,
          ...(threadsBySession.get("session-local-companion") ?? [])
        ]);

        threadDetails.set(targetThreadId, {
          activities: [],
          messageCount: 0,
          thread: nextThread,
          messages: []
        });
      }

      const detail = threadDetails.get(targetThreadId)!;
      detail.thread.updatedAt = timestamp;
      detail.activities = [
        ...detail.activities,
        {
          detail: `Reply generated for: ${message}`,
          durationMs: 1000,
          files: [],
          fileChanges: [],
          id: `activity-${detail.activities.length + 1}`,
          itemId: `activity-${detail.activities.length + 1}`,
          kind: "command",
          status: "completed",
          title: `Ran synthetic turn for "${message.slice(0, 32)}"`,
          turnId: `turn-${detail.activities.length + 1}`
        }
      ];
      detail.messages = [
        ...detail.messages,
        {
          content: message,
          id: `message-user-${detail.messages.length + 1}`,
          role: "user",
          turnId: `turn-${detail.activities.length}`
        },
        {
          content: `Fixture adapter captured: ${message}`,
          id: `message-assistant-${detail.messages.length + 2}`,
          role: "assistant",
          turnId: `turn-${detail.activities.length}`
        }
      ];
      detail.messageCount = detail.messages.length;

      return detail;
    }
  };
}
