import type {
  AdapterCapabilities,
  CodexAdapter,
  SessionSummary,
  ThreadDetail,
  ThreadSummary
} from "../shared/contracts";

const capabilities: AdapterCapabilities = {
  supportsAttach: false,
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
        title: "Bridge bootstrap"
      },
      {
        id: "thread-ui-shell",
        mode: "fallback",
        title: "UI shell"
      }
    ]
  ]
]);

const threadDetails = new Map<string, ThreadDetail>([
  [
    "thread-bridge-bootstrap",
    {
      thread: {
        id: "thread-bridge-bootstrap",
        mode: "fallback",
        title: "Bridge bootstrap"
      },
      messages: [
        {
          id: "message-system-bootstrap",
          role: "system",
          content: "Fixture adapter is active until a real local Codex surface is wired in."
        },
        {
          id: "message-assistant-bootstrap",
          role: "assistant",
          content:
            "Bridge shell is in place. First boot should show sessions, threads, and workspace files."
        }
      ]
    }
  ],
  [
    "thread-ui-shell",
    {
      thread: {
        id: "thread-ui-shell",
        mode: "fallback",
        title: "UI shell"
      },
      messages: [
        {
          id: "message-assistant-ui",
          role: "assistant",
          content: "The shell should feel calm and operational."
        }
      ]
    }
  ]
]);

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
    }
  };
}
