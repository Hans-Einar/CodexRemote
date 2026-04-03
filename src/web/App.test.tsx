// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";
import type { ThreadResponse } from "../shared/contracts";

vi.mock("@monaco-editor/react", () => ({
  default: ({
    onChange,
    value
  }: {
    onChange?: (value: string) => void;
    value?: string;
  }) => (
    <textarea
      aria-label="Code editor"
      onChange={(event) => onChange?.(event.currentTarget.value)}
      value={value ?? ""}
    />
  )
}));

const terminalTestState = vi.hoisted(() => ({
  instances: [] as Array<{
    onDataCallback: ((value: string) => void) | null;
    written: string[];
  }>
}));

const eventSourceTestState = vi.hoisted(() => ({
  instances: [] as Array<{
    close: () => void;
    emit: (payload: unknown) => void;
    onmessage: ((event: { data: string }) => void) | null;
    url: string;
  }>
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    openedOn: Element | null = null;
    onDataCallback: ((value: string) => void) | null = null;
    written: string[] = [];

    constructor() {
      terminalTestState.instances.push(this);
    }

    loadAddon() {
      // noop for tests
    }

    open(element: Element) {
      this.openedOn = element;
    }

    onData(callback: (value: string) => void) {
      this.onDataCallback = callback;
      return {
        dispose() {
          // noop for tests
        }
      };
    }

    write(value: string) {
      this.written.push(value);
    }

    dispose() {
      // noop for tests
    }
  }
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {
      // noop for tests
    }
  }
}));

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    })
  );
}

describe("App", () => {
  const savedWrites: Array<{ content: string; path: string; projectId?: string }> = [];
  const sendRequests: Array<Record<string, unknown>> = [];
  const gitActions: Array<{ method: string; payload: unknown; url: string }> = [];
  const websocketMessages: string[] = [];

  beforeEach(() => {
    savedWrites.length = 0;
    sendRequests.length = 0;
    gitActions.length = 0;
    websocketMessages.length = 0;
    terminalTestState.instances.length = 0;
    eventSourceTestState.instances.length = 0;
    const gitStatusResponse = {
      available: true,
      branch: "main",
      branches: ["feature/ui", "main"],
      dirtyCount: 2,
      fileStatuses: [
        {
          additions: 6,
          badges: ["M"],
          deletions: 2,
          relativePath: "README.md",
          staged: false,
          unstaged: true
        },
        {
          additions: 3,
          badges: ["A"],
          deletions: 0,
          relativePath: "docs/notes.md",
          staged: true,
          unstaged: false
        }
      ],
      folderStatuses: [
        {
          additions: 0,
          badges: ["A1"],
          deletions: 0,
          relativePath: "docs",
          staged: false,
          unstaged: false
        }
      ],
      stagedCount: 1,
      unstagedCount: 1
    };
    const threadSummaries = [
      {
        id: "thread-bridge-bootstrap",
        mode: "mirrored",
        title: "Bridge bootstrap",
        updatedAt: "2026-04-02T09:10:00.000Z"
      },
      {
        id: "thread-ui-shell",
        mode: "mirrored",
        title: "UI shell",
        updatedAt: "2026-04-02T09:00:00.000Z"
      }
    ];
    let sharedActiveThreadId: string | null = "thread-bridge-bootstrap";
    let sharedActiveThreadUpdatedAt: string | null = "2026-04-02T09:10:00.000Z";
    const threadResponses = new Map<string, ThreadResponse>([
      [
        "thread-bridge-bootstrap",
        {
          activities: [
            {
              detail: "C:\\Users\\hanse\\GIT\\CodexRemote\\README.md",
              durationMs: 1000,
              files: [],
              fileChanges: [],
              id: "activity-1",
              itemId: "activity-1",
              kind: "command",
              status: "completed",
              title: "Ran Get-Content -Path README.md for 1.0s",
              turnId: "turn-bootstrap"
            }
          ],
          messageCount: 2,
          messages: [
            {
              content: "Bridge shell is in place.",
              id: "message-1",
              role: "system",
              turnId: "turn-bootstrap"
            },
            {
              content: "First boot should show sessions, threads, and workspace files.",
              id: "message-2",
              role: "assistant",
              turnId: "turn-bootstrap"
            }
          ],
          thread: {
            id: "thread-bridge-bootstrap",
            mode: "mirrored",
            title: "Bridge bootstrap",
            updatedAt: "2026-04-02T09:10:00.000Z"
          }
        }
      ],
      [
        "thread-ui-shell",
        {
          activities: [
            {
              detail: "Workspace shell refinements outlined.",
              durationMs: null,
              files: [],
              fileChanges: [],
              id: "activity-2",
              itemId: "activity-2",
              kind: "plan",
              status: "completed",
              title: "Updated plan",
              turnId: "turn-ui"
            }
          ],
          messageCount: 1,
          messages: [
            {
              content: "The shell should feel calm and operational.",
              id: "message-3",
              role: "assistant",
              turnId: "turn-ui"
            }
          ],
          thread: {
            id: "thread-ui-shell",
            mode: "mirrored",
            title: "UI shell",
            updatedAt: "2026-04-02T09:00:00.000Z"
          }
        }
      ]
    ]);

    class MockWebSocket {
      static instances: MockWebSocket[] = [];
      onclose: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onopen: (() => void) | null = null;
      readyState = 1;
      url: string;

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
        queueMicrotask(() => {
          this.onopen?.();
          this.onmessage?.({
            data: JSON.stringify({
              data: "PowerShell ready\r\n",
              type: "data"
            })
          });
        });
      }

      close() {
        this.onclose?.();
      }

      send(data: string) {
        websocketMessages.push(data);
      }
    }

    class MockEventSource {
      static instances: MockEventSource[] = [];
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      url: string;

      constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
        eventSourceTestState.instances.push(this);
      }

      close() {
        // noop for tests
      }

      emit(payload: unknown) {
        this.onmessage?.({
          data: JSON.stringify(payload)
        });
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        addEventListener() {
          // noop for tests
        },
        matches: false,
        media: "(max-width: 960px)",
        onchange: null,
        removeEventListener() {
          // noop for tests
        }
      }))
    );

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/health") {
        return jsonResponse({
          status: "ok",
          adapterLabel: "Codex app-server stdio adapter",
          ports: {
            api: 3180,
            vite: 5280
          }
        });
      }

      if (url === "/api/auth/config") {
        return jsonResponse({
          configured: false,
          enabled: false
        });
      }

      if (url === "/api/auth/me") {
        return jsonResponse({
          authenticated: false,
          configured: false,
          enabled: false,
          user: null
        });
      }

      if (url === "/api/auth/users") {
        return jsonResponse({
          users: []
        });
      }

      if (url === "/api/modes") {
        return jsonResponse({
          adapterLabel: "Codex app-server stdio adapter",
          capabilities: {
            supportsAttach: false,
            supportsSend: true,
            supportsStreaming: false,
            supportsWorkspaceHints: false
          },
          mode: "mirrored"
        });
      }

      if (url === "/api/runtime") {
        return jsonResponse({
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
            },
            {
              defaultReasoningEffort: "high",
              description: "Ultra-fast coding model.",
              displayName: "GPT-5.3-Codex-Spark",
              id: "gpt-5.3-codex-spark",
              isDefault: false,
              supportedReasoningEfforts: ["low", "medium", "high", "xhigh"]
            }
          ],
          usage: {
            creditsBalance: "0",
            creditsUnlimited: false,
            limitName: null,
            planType: "pro",
            primaryUsedPercent: 0,
            secondaryUsedPercent: 6
          }
        });
      }

      if (url === "/api/projects") {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body)) as {
            browserIdeUrl?: string | null;
            name: string;
            rootPath: string;
          };

          return jsonResponse({
            browserIdeUrl: payload.browserIdeUrl ?? null,
            createdAt: "2026-04-02T00:00:00.000Z",
            id: "project-added",
            name: payload.name,
            rootPath: payload.rootPath,
            updatedAt: "2026-04-02T00:00:00.000Z"
          });
        }

        return jsonResponse({
          defaultProjectId: "project-codexremote",
          projects: [
            {
              browserIdeUrl: null,
              createdAt: "2026-04-02T00:00:00.000Z",
              id: "project-codexremote",
              name: "CodexRemote",
              rootPath: "C:\\Users\\hanse\\GIT\\CodexRemote",
              updatedAt: "2026-04-02T00:00:00.000Z"
            }
          ]
        });
      }

      if (url === "/api/projects/project-codexremote/thread-state") {
        if (init?.method === "PUT") {
          const payload = JSON.parse(String(init.body)) as {
            activeThreadId?: string | null;
            activeThreadUpdatedAt?: string | null;
          };
          sharedActiveThreadId = payload.activeThreadId ?? null;
          sharedActiveThreadUpdatedAt = payload.activeThreadUpdatedAt ?? null;
          return jsonResponse({
            activeThreadId: sharedActiveThreadId,
            activeThreadUpdatedAt: sharedActiveThreadUpdatedAt,
            selectionSource: "web_ui",
            updatedAt: "2026-04-02T09:15:00.000Z"
          });
        }

        return jsonResponse({
          activeThreadId: sharedActiveThreadId,
          activeThreadUpdatedAt: sharedActiveThreadUpdatedAt,
          selectionSource: "project_latest",
          updatedAt: "2026-04-02T09:10:00.000Z"
        });
      }

      if (url === "/api/sessions" || url === "/api/sessions?projectId=project-codexremote") {
        return jsonResponse({
          sessions: [
            {
              id: "session-local-companion",
              title: "Local Companion Baseline",
              workspaceLabel: "CodexRemote"
            }
          ]
        });
      }

      if (
        url === "/api/threads?sessionId=session-local-companion" ||
        url === "/api/threads?sessionId=session-local-companion&projectId=project-codexremote"
      ) {
        return jsonResponse({
          activeThreadId: sharedActiveThreadId,
          threads: threadSummaries
        });
      }

      if (url.startsWith("/api/threads/") && init?.method !== "POST") {
        const [threadPath] = url.split("?");
        const threadId = decodeURIComponent(threadPath.replace("/api/threads/", ""));
        const thread = threadResponses.get(threadId);

        if (!thread) {
          throw new Error(`Unknown thread requested: ${threadId}`);
        }

        return jsonResponse(thread);
      }

      if (url === "/api/threads/send" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as {
          accessMode?: string;
          message: string;
          model?: string | null;
          reasoningEffort?: string | null;
          threadId?: string | null;
        };
        sendRequests.push(payload);
        const targetThreadId = payload.threadId ?? "thread-live-compose";
        const existingThread = threadResponses.get(targetThreadId);
        const nextTitle = payload.threadId ? existingThread?.thread.title ?? "Bridge bootstrap" : payload.message;
        const nextThread =
          existingThread ??
          {
            activities: [],
            messageCount: 0,
            messages: [],
            thread: {
              id: targetThreadId,
              mode: "mirrored",
              title: nextTitle,
              updatedAt: sharedActiveThreadUpdatedAt ?? "2026-04-02T09:15:00.000Z"
            }
          };

        nextThread.messages = [
          ...nextThread.messages,
            {
              content: payload.message,
              id: `message-user-${nextThread.messages.length + 1}`,
              role: "user",
              turnId: `turn-${nextThread.activities.length + 1}`
            },
            {
              content: `Codex live reply to: ${payload.message}`,
              id: `message-assistant-${nextThread.messages.length + 2}`,
              role: "assistant",
              turnId: `turn-${nextThread.activities.length + 1}`
            }
          ];
        nextThread.messageCount = nextThread.messages.length;
        nextThread.activities = [
          ...nextThread.activities,
            {
              detail: payload.message,
              durationMs: 1000,
              files: [],
              fileChanges: [],
              id: `activity-${nextThread.activities.length + 1}`,
              itemId: `activity-${nextThread.activities.length + 1}`,
              kind: "command",
              status: "completed",
              title: `Ran codex turn for ${payload.message}`,
              turnId: `turn-${nextThread.activities.length + 1}`
            }
          ];
        sharedActiveThreadId = targetThreadId;
        sharedActiveThreadUpdatedAt = new Date().toISOString();
        nextThread.thread.updatedAt = sharedActiveThreadUpdatedAt;

        threadResponses.set(targetThreadId, nextThread);

        if (!threadSummaries.some((thread) => thread.id === targetThreadId)) {
          threadSummaries.unshift({
            id: targetThreadId,
            mode: "mirrored",
            title: nextThread.thread.title,
            updatedAt: sharedActiveThreadUpdatedAt
          });
        } else {
          for (const thread of threadSummaries) {
            if (thread.id === targetThreadId) {
              thread.updatedAt = sharedActiveThreadUpdatedAt;
            }
          }
        }

        return jsonResponse(nextThread);
      }

      if (url === "/api/workspace/tree?projectId=project-codexremote") {
        return jsonResponse({
          nodes: [
            {
              children: [
                {
                  id: "docs/notes.md",
                  kind: "file",
                  name: "notes.md",
                  relativePath: "docs/notes.md"
                }
              ],
              id: "docs",
              kind: "directory",
              name: "docs",
              relativePath: "docs"
            },
            {
              id: "README.md",
              kind: "file",
              name: "README.md",
              relativePath: "README.md"
            }
          ],
          rootPath: "C:\\Users\\hanse\\GIT\\CodexRemote"
        });
      }

      if (url === "/api/git/status?projectId=project-codexremote") {
        return jsonResponse(gitStatusResponse);
      }

      if (url === "/api/git/diff?path=README.md&projectId=project-codexremote") {
        return jsonResponse({
          diff: "diff --git a/README.md b/README.md\n@@ -1,2 +1,3 @@\n # Overview\n \n-Baseline boot is ready.\n+Baseline boot is ready.\n+Git side panel preview.\n",
          relativePath: "README.md"
        });
      }

      if (url === "/api/git/diff?path=docs%2Fnotes.md&projectId=project-codexremote") {
        return jsonResponse({
          diff: "diff --git a/docs/notes.md b/docs/notes.md\nnew file mode 100644\n@@ -0,0 +1,2 @@\n+# Notes\n+\n+Workspace browsing works.\n",
          relativePath: "docs/notes.md"
        });
      }

      if (url === "/api/workspace/file?path=README.md&projectId=project-codexremote") {
        return jsonResponse({
          content: "# Overview\n\nBaseline boot is ready.",
          contentType: "text/markdown",
          relativePath: "README.md",
          size: 32
        });
      }

      if (url === "/api/workspace/file?path=docs%2Fnotes.md&projectId=project-codexremote") {
        return jsonResponse({
          content: "# Notes\n\nWorkspace browsing works.",
          contentType: "text/markdown",
          relativePath: "docs/notes.md",
          size: 32
        });
      }

      if (url === "/api/workspace/file" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { content: string; path: string };
        savedWrites.push(body);
        return jsonResponse({
          relativePath: body.path,
          saved: true
        });
      }

      if (
        (url === "/api/git/stage-all" ||
          url === "/api/git/commit" ||
          url === "/api/git/checkout" ||
          url === "/api/git/branches" ||
          url === "/api/git/pull" ||
          url === "/api/git/push") &&
        typeof init?.method === "string"
      ) {
        const payload = init.body ? JSON.parse(String(init.body)) : {};
        gitActions.push({
          method: init.method,
          payload,
          url
        });

        if (url === "/api/git/commit") {
          return jsonResponse({
            committed: true
          });
        }

        if (url === "/api/git/checkout") {
          return jsonResponse({
            branch: (payload as { branch: string }).branch
          });
        }

        if (url === "/api/git/branches") {
          return jsonResponse({
            branch: (payload as { name: string }).name,
            created: true
          });
        }

        return jsonResponse({
          ok: true
        });
      }

      throw new Error(`Unhandled fetch for ${url}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the shell with tree, editor, and terminal baselines", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "CodexRemote" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "CodexRemote logo" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Local Companion Baseline")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Bridge bootstrap" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open controls" })).toBeInTheDocument();
      expect(screen.getByRole("tree", { name: "Git changed files" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Model selector" })).toHaveValue("gpt-5.4");
      expect(screen.getByRole("combobox", { name: "Reasoning selector" })).toHaveValue("medium");
      expect(screen.getByRole("combobox", { name: "Access selector" })).toHaveValue("workspace-write");
      expect(screen.getByRole("tab", { name: "Conversation view" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
    });

    const detailButtons = screen.getAllByRole("button", {
      name: /Conversation.*Show details/
    });
    await user.click(detailButtons[0]);

      expect(screen.getByText("Work summary")).toBeInTheDocument();
      expect(screen.getByText("Ran Get-Content -Path README.md for 1.0s")).toBeInTheDocument();
    });

  it("switches threads when the user selects a different one", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "UI shell" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "UI shell" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "UI shell" })).toBeInTheDocument();
    });
  });

  it("sends a live prompt through the conversation composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    const prompt = await screen.findByRole("textbox", { name: "Conversation prompt" });
    fireEvent.change(prompt, {
      target: {
        value: "Inspect the shell"
      }
    });
    await user.click(screen.getByRole("button", { name: "Send to Codex" }));

    await waitFor(() => {
      expect(screen.getByText("Codex live reply to: Inspect the shell")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Conversation prompt" })).toHaveValue("");
    });

    expect(sendRequests.at(-1)).toMatchObject({
      accessMode: "workspace-write",
      message: "Inspect the shell",
      model: "gpt-5.4",
      projectId: "project-codexremote",
      reasoningEffort: "medium",
      threadId: "thread-bridge-bootstrap"
    });
  });

  it("lets the user change model, reasoning, and access mode before sending", async () => {
    const user = userEvent.setup();
    render(<App />);

    const modelSelect = await screen.findByRole("combobox", { name: "Model selector" });
    const reasoningSelect = screen.getByRole("combobox", { name: "Reasoning selector" });
    const accessSelect = screen.getByRole("combobox", { name: "Access selector" });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "GPT-5.3-Codex-Spark" })).toBeInTheDocument();
    });

    await user.selectOptions(modelSelect, "gpt-5.3-codex-spark");
    await user.selectOptions(reasoningSelect, "xhigh");
    await user.selectOptions(accessSelect, "danger-full-access");

    expect(modelSelect).toHaveValue("gpt-5.3-codex-spark");
    expect(reasoningSelect).toHaveValue("xhigh");
    expect(accessSelect).toHaveValue("danger-full-access");

    fireEvent.change(screen.getByRole("textbox", { name: "Conversation prompt" }), {
      target: {
        value: "Use the faster model"
      }
    });
    await user.click(screen.getByRole("button", { name: "Send to Codex" }));

    await waitFor(() => {
      expect(screen.getByText("Codex live reply to: Use the faster model")).toBeInTheDocument();
    });

    expect(sendRequests.at(-1)).toMatchObject({
      accessMode: "danger-full-access",
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "xhigh"
    });
  });

  it("renders live activity updates from the thread event stream", async () => {
    render(<App />);

    await waitFor(() => {
      expect(eventSourceTestState.instances.length).toBeGreaterThan(0);
    });

    act(() => {
      screen.getAllByRole("button", { name: /Conversation.*Show details/ })[0].click();
    });

    act(() => {
      eventSourceTestState.instances[0].emit({
        detail: "Reading README.md",
        files: [],
        fileChanges: [],
        groupId: "thread-bridge-bootstrap:turn-bootstrap:item-42",
        id: "thread-bridge-bootstrap:item-42:delta",
        itemId: "item-42",
        kind: "agent_delta",
        status: "inProgress",
        threadId: "thread-bridge-bootstrap",
        title: "Assistant response streaming",
        tokenUsageSummary: null,
        turnId: "turn-bootstrap"
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Streaming now")).toBeInTheDocument();
      expect(screen.getByText("Assistant response streaming")).toBeInTheDocument();
      expect(screen.getByText("Reading README.md")).toBeInTheDocument();
    });
  });

  it("uses enter to send and ctrl+enter to insert a newline", async () => {
    render(<App />);

    const prompt = (await screen.findByRole("textbox", { name: "Conversation prompt" })) as HTMLTextAreaElement;
    fireEvent.change(prompt, {
      target: {
        value: "Line one"
      }
    });
    fireEvent.keyDown(prompt, {
      ctrlKey: true,
      key: "Enter"
    });
    expect(screen.getByRole("textbox", { name: "Conversation prompt" })).toHaveValue("Line one\n");

    fireEvent.change(screen.getByRole("textbox", { name: "Conversation prompt" }), {
      target: {
        value: "Line one\nLine two"
      }
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Conversation prompt" }), {
      key: "Enter"
    });

    await waitFor(() => {
      expect(screen.getByText(/Codex live reply to: Line one\s+Line two/)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Conversation prompt" })).toHaveValue("");
    });
  });

  it("opens files, edits them, and saves through the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));
    const workspaceTree = screen.getByRole("tree", { name: "Workspace files" });
    await user.click(within(workspaceTree).getByRole("button", { name: "README.md" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show source" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Show source" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue(
        "# Overview\n\nBaseline boot is ready."
      );
    });

    await user.clear(screen.getByRole("textbox", { name: "Code editor" }));
    await user.type(
      screen.getByRole("textbox", { name: "Code editor" }),
      "# Overview\n\nSaved through Monaco."
    );
    await user.click(screen.getByRole("button", { name: "Save file" }));

    expect(savedWrites).toEqual([
      {
        content: "# Overview\n\nSaved through Monaco.",
        path: "README.md",
        projectId: "project-codexremote"
      }
    ]);
  });

  it("opens nested files from the explorer tree", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));
    const workspaceTree = screen.getByRole("tree", { name: "Workspace files" });
    expect(within(workspaceTree).queryByRole("button", { name: "notes.md" })).not.toBeInTheDocument();

    await user.click(within(workspaceTree).getByRole("button", { name: "docs" }));

    await waitFor(() => {
      expect(within(workspaceTree).getByRole("button", { name: "notes.md" })).toBeInTheDocument();
    });

    await user.click(within(workspaceTree).getByRole("button", { name: "notes.md" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
      expect(screen.getByText("Workspace browsing works.")).toBeInTheDocument();
    });
  });

  it("supports a compact zen mode that switches between agent and workspace surfaces", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        addEventListener() {
          // noop for tests
        },
        matches: true,
        media: "(max-width: 960px)",
        onchange: null,
        removeEventListener() {
          // noop for tests
        }
      }))
    );

    const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Conversation view" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
      });

    expect(screen.getByRole("heading", { name: "Threads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workspace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Threads" })).not.toBeInTheDocument();
  });

  it("shows only the workspace navigator in the left sidebar when workspace view is selected on desktop", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Conversation view" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Bridge bootstrap" })).toBeInTheDocument();
      expect(screen.getByRole("separator", { name: "Resize left sidebar and main panel" })).toBeInTheDocument();
      expect(screen.getByRole("separator", { name: "Resize main panel and right sidebar" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "Workspace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Conversation" })).not.toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Workspace files" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Threads" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Git" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stage all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open controls" })).toBeInTheDocument();
  });

  it("renders an optional VS Code launch link when a browser IDE url is configured", async () => {
    vi.stubEnv("VITE_BROWSER_IDE_URL", "http://127.0.0.1:3000");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Launch VS Code" })).toHaveAttribute(
        "href",
        "http://127.0.0.1:3000"
      );
    });
  });

  it("connects the terminal pane to the terminal websocket", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));

    await waitFor(() => {
      expect(terminalTestState.instances.length).toBeGreaterThan(0);
    });

    const terminal = terminalTestState.instances[0];
    terminal.onDataCallback?.("dir\r");

    expect(websocketMessages).toContain(
      JSON.stringify({
        data: "dir\r",
        type: "input"
      })
    );
  });

  it("opens the git controls overlay and supports the workflow actions there", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open controls" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open controls" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Git controls" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Stage all" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), {
      target: {
        value: "Workspace update"
      }
    });
    await user.click(screen.getByRole("button", { name: "Commit staged" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Branch selector" }), "feature/ui");
    await user.click(screen.getByRole("button", { name: "Checkout branch" }));
    await user.click(screen.getByRole("button", { name: "New branch" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Create branch" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("textbox", { name: "New branch name" }), {
      target: {
        value: "feature/right-panel"
      }
    });
    await user.click(screen.getByRole("button", { name: "Create branch" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create branch" })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Pull" }));
    await user.click(screen.getByRole("button", { name: "Push" }));

    expect(gitActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "/api/git/stage-all"
        }),
        expect.objectContaining({
          payload: {
            message: "Workspace update",
            projectId: "project-codexremote"
          },
          url: "/api/git/commit"
        }),
        expect.objectContaining({
          payload: {
            branch: "feature/ui",
            projectId: "project-codexremote"
          },
          url: "/api/git/checkout"
        }),
        expect.objectContaining({
          payload: {
            name: "feature/right-panel",
            projectId: "project-codexremote"
          },
          url: "/api/git/branches"
        }),
        expect.objectContaining({
          payload: {
            projectId: "project-codexremote"
          },
          url: "/api/git/pull"
        }),
        expect.objectContaining({
          payload: {
            projectId: "project-codexremote"
          },
          url: "/api/git/push"
        })
      ])
    );
  });

  it("opens a git diff from the right side panel and switches into workspace view", async () => {
    const user = userEvent.setup();
    render(<App />);

    const gitTree = await screen.findByRole("tree", { name: "Git changed files" });

    await waitFor(() => {
      expect(within(gitTree).getByRole("button", { name: "README.md" })).toBeInTheDocument();
    });

    await user.click(within(gitTree).getByRole("button", { name: "README.md" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
      expect((screen.getByRole("textbox", { name: "Code editor" }) as HTMLTextAreaElement).value).toContain(
        "Git side panel preview."
      );
    });
  });

  it("keeps desktop workspace mode on a file-only sidebar while preserving collapse toggles", async () => {
    const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
        expect(screen.getByRole("separator", { name: "Resize left sidebar and main panel" })).toBeInTheDocument();
        expect(screen.getByRole("separator", { name: "Resize main panel and right sidebar" })).toBeInTheDocument();
        expect(screen.queryByRole("separator", { name: "Resize explorer and editor" })).not.toBeInTheDocument();
        expect(screen.queryByRole("separator", { name: "Resize conversation and workspace" })).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole("tab", { name: "Workspace view" }));

      await waitFor(() => {
        expect(screen.queryByRole("separator", { name: "Resize explorer and editor" })).not.toBeInTheDocument();
        expect(screen.getByRole("tree", { name: "Workspace files" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Collapse explorer" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Collapse terminal" })).toBeInTheDocument();
      });

    await user.click(screen.getByRole("button", { name: "Collapse explorer" }));
    expect(screen.getByRole("button", { name: "Expand explorer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse terminal" }));
    expect(screen.getByRole("button", { name: "Expand terminal" })).toBeInTheDocument();
  });
});
