// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

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
  const gitActions: Array<{ method: string; payload: unknown; url: string }> = [];
  const websocketMessages: string[] = [];

  beforeEach(() => {
    savedWrites.length = 0;
    gitActions.length = 0;
    websocketMessages.length = 0;
    terminalTestState.instances.length = 0;

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

    vi.stubGlobal("WebSocket", MockWebSocket);
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
          adapterLabel: "Fixture adapter",
          ports: {
            api: 3180,
            vite: 5280
          }
        });
      }

      if (url === "/api/modes") {
        return jsonResponse({
          adapterLabel: "Fixture adapter",
          capabilities: {
            supportsAttach: false,
            supportsStreaming: false,
            supportsWorkspaceHints: false
          },
          mode: "fallback"
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

      if (url === "/api/sessions") {
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

      if (url === "/api/threads?sessionId=session-local-companion") {
        return jsonResponse({
          threads: [
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
        });
      }

      if (url === "/api/threads/thread-bridge-bootstrap") {
        return jsonResponse({
          messages: [
            {
              content: "Bridge shell is in place.",
              id: "message-1",
              role: "system"
            },
            {
              content: "First boot should show sessions, threads, and workspace files.",
              id: "message-2",
              role: "assistant"
            }
          ],
          thread: {
            id: "thread-bridge-bootstrap",
            mode: "fallback",
            title: "Bridge bootstrap"
          }
        });
      }

      if (url === "/api/threads/thread-ui-shell") {
        return jsonResponse({
          messages: [
            {
              content: "The shell should feel calm and operational.",
              id: "message-3",
              role: "assistant"
            }
          ],
          thread: {
            id: "thread-ui-shell",
            mode: "fallback",
            title: "UI shell"
          }
        });
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
        return jsonResponse({
          available: true,
          branch: "main",
          branches: ["feature/ui", "main"],
          dirtyCount: 2,
          fileStatuses: [
            {
              badges: ["M"],
              relativePath: "README.md"
            },
            {
              badges: ["?"],
              relativePath: "docs/notes.md"
            }
          ],
          folderStatuses: [
            {
              badges: ["?1"],
              relativePath: "docs"
            }
          ],
          stagedCount: 0,
          unstagedCount: 2
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
          url === "/api/git/branches") &&
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
    render(<App />);

    expect(screen.getByRole("heading", { name: "CodexRemote" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "CodexRemote logo" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Fixture adapter")).toBeInTheDocument();
    });

    expect(screen.getByText("Local Companion Baseline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bridge bootstrap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "README.md" })).toBeInTheDocument();
    expect(screen.getByText("PowerShell terminal connected")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Branch selector" })).toHaveValue("main");
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("?1")).toBeInTheDocument();
  });

  it("switches threads when the user selects a different one", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "UI shell" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "UI shell" }));

    await waitFor(() => {
      expect(screen.getByText("The shell should feel calm and operational.")).toBeInTheDocument();
    });
  });

  it("opens files, edits them, and saves through the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "README.md" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "README.md" }));

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
      expect(screen.getByRole("button", { name: "docs" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "notes.md" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "docs" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "notes.md" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "notes.md" }));

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
      expect(screen.getByRole("tab", { name: "Agent view" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Workspace view" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Threads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workspace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Workspace view" }));

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Threads" })).not.toBeInTheDocument();
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
    render(<App />);

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

  it("supports git workflow actions from the git panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stage all" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Stage all" }));
    await user.clear(screen.getByRole("textbox", { name: "Commit message" }));
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "Workspace update");
    await user.click(screen.getByRole("button", { name: "Commit staged" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Branch selector" }), "feature/ui");
    await user.click(screen.getByRole("button", { name: "Checkout branch" }));

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
        })
      ])
    );
  });

  it("renders resize handles and collapse toggles for the ide layout", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("separator", { name: "Resize conversation and workspace" })).toBeInTheDocument();
      expect(screen.getByRole("separator", { name: "Resize explorer and editor" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Collapse explorer" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Collapse terminal" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Collapse explorer" }));
    expect(screen.getByRole("button", { name: "Expand explorer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse terminal" }));
    expect(screen.getByRole("button", { name: "Expand terminal" })).toBeInTheDocument();
  });
});
