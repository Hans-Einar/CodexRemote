import { createStdioCodexAppServerAdapter } from "./stdioCodexAppServerAdapter";

class MockTransport {
  notificationListeners: Array<(notification: { method: string; params: unknown }) => void> = [];
  requests: Array<{ method: string; params: unknown }> = [];
  sendThreadReadCount = 0;

  async request(method: string, params: unknown) {
    this.requests.push({
      method,
      params
    });

    if (method === "initialize") {
      return {
        codexHome: "C:/Users/hanse/.codex",
        platformFamily: "windows",
        platformOs: "windows",
        userAgent: "codex-app-server"
      };
    }

    if (method === "thread/list") {
      return {
        data: [
          {
            cwd: "C:/Users/hanse/GIT/CodexRemote",
            id: "thread-live-1",
            name: "Live thread",
            preview: "Preview text",
            source: "vscode",
            updatedAt: 1775126400
          }
        ],
        nextCursor: null
      };
    }

    if (method === "model/list") {
      return {
        data: [
          {
            defaultReasoningEffort: "medium",
            description: "Latest frontier agentic coding model.",
            displayName: "gpt-5.4",
            hidden: false,
            id: "gpt-5.4",
            isDefault: true,
            supportedReasoningEfforts: [
              { reasoningEffort: "low" },
              { reasoningEffort: "medium" },
              { reasoningEffort: "high" },
              { reasoningEffort: "xhigh" }
            ]
          }
        ],
        nextCursor: null
      };
    }

    if (method === "account/rateLimits/read") {
      return {
        rateLimits: {
          credits: {
            balance: "0",
            unlimited: false
          },
          limitName: null,
          planType: "pro",
          primary: {
            usedPercent: 0
          },
          secondary: {
            usedPercent: 6
          }
        }
      };
    }

    if (method === "thread/read") {
      const threadId = (params as { threadId?: string }).threadId;
      if (threadId === "thread-send-1") {
        this.sendThreadReadCount += 1;

        if (this.sendThreadReadCount === 1) {
          throw new Error(
            "thread thread-send-1 is not materialized yet; includeTurns is unavailable before first user message"
          );
        }

        return {
          thread: {
            id: "thread-send-1",
            name: "Live send thread",
            preview: "Inspect the shell",
            status: {
              type: "idle"
            },
            turns: [
              {
                id: "turn-send-1",
                items: [
                  {
                    content: [
                      {
                        text: "Inspect the shell",
                        type: "text"
                      }
                    ],
                    type: "userMessage"
                  },
                  {
                    text: "Codex completed the request",
                    type: "agentMessage"
                  }
                ],
                status: "completed"
              }
            ]
          }
        };
      }

      return {
        thread: {
          id: "thread-live-1",
          name: "Live thread",
          preview: "Preview text",
          turns: [
            {
              items: [
                {
                  content: [
                    {
                      text: "hello from user",
                      type: "text"
                    }
                  ],
                  type: "userMessage"
                },
                {
                  text: "hello from assistant",
                  type: "agentMessage"
                }
              ]
            }
          ]
        }
      };
    }

    if (method === "thread/start") {
      return {
        thread: {
          id: "thread-send-1"
        }
      };
    }

    if (method === "thread/resume") {
      return {
        thread: {
          id: (params as { threadId: string }).threadId
        }
      };
    }

    if (method === "turn/start") {
      return {
        turn: {
          id: "turn-send-1"
        }
      };
    }

    throw new Error(`Unhandled method ${method}`);
  }

  close() {
    // noop for tests
  }

  onNotification(listener: (notification: { method: string; params: unknown }) => void) {
    this.notificationListeners.push(listener);

    return () => {
      this.notificationListeners = this.notificationListeners.filter((entry) => entry !== listener);
    };
  }
}

describe("StdioCodexAppServerAdapter", () => {
  it("initializes once and maps thread/list and thread/read into the local adapter contract", async () => {
    const transport = new MockTransport();
    const adapter = createStdioCodexAppServerAdapter({
      cwd: "C:\\Users\\hanse\\GIT\\CodexRemote",
      transport
    });

    const sessions = await adapter.listSessions("C:\\Users\\hanse\\GIT\\CodexRemote");
    expect(sessions[0].title).toBe("Live Codex App Server");

    const threads = await adapter.listThreads(sessions[0].id, "C:\\Users\\hanse\\GIT\\CodexRemote");
    expect(threads).toEqual([
      expect.objectContaining({
        id: "thread-live-1",
        title: "Live thread"
      })
    ]);

    const detail = await adapter.getThread("thread-live-1");
    expect(detail?.messages).toEqual([
      expect.objectContaining({
        content: "hello from user",
        role: "user"
      }),
      expect.objectContaining({
        content: "hello from assistant",
        role: "assistant"
      })
    ]);

    expect(transport.requests[0].method).toBe("initialize");
    expect(transport.requests[1].method).toBe("thread/list");
    expect(transport.requests[2].method).toBe("thread/read");
  });

  it("returns runtime model options and usage status", async () => {
    const transport = new MockTransport();
    const adapter = createStdioCodexAppServerAdapter({
      cwd: "C:\\Users\\hanse\\GIT\\CodexRemote",
      transport
    });

    const runtimeInfo = await adapter.getRuntimeInfo();

    expect(runtimeInfo.defaultModelId).toBe("gpt-5.4");
    expect(runtimeInfo.defaultAccessMode).toBe("workspace-write");
    expect(runtimeInfo.usage?.secondaryUsedPercent).toBe(6);
  });

  it("creates a new live thread and waits for the send turn to complete", async () => {
    const transport = new MockTransport();
    const adapter = createStdioCodexAppServerAdapter({
      cwd: "C:\\Users\\hanse\\GIT\\CodexRemote",
      transport
    });

    const detail = await adapter.sendMessage({
      accessMode: "danger-full-access",
      message: "Inspect the shell",
      model: "gpt-5.4",
      projectRoot: "C:\\Users\\hanse\\GIT\\CodexRemote"
      ,
      reasoningEffort: "xhigh"
    });

    expect(detail.thread.id).toBe("thread-send-1");
    expect(detail.messages).toEqual([
      expect.objectContaining({
        content: "Inspect the shell",
        role: "user"
      }),
      expect.objectContaining({
        content: "Codex completed the request",
        role: "assistant"
      })
    ]);
    expect(transport.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "thread/start",
          params: expect.objectContaining({
            approvalPolicy: "never",
            model: "gpt-5.4",
            sandbox: "danger-full-access"
          })
        }),
        expect.objectContaining({
          method: "turn/start",
          params: expect.objectContaining({
            approvalPolicy: "never",
            effort: "xhigh",
            model: "gpt-5.4"
          })
        })
      ])
    );
  });

  it("resumes an existing thread before sending a live turn", async () => {
    const transport = new MockTransport();
    const adapter = createStdioCodexAppServerAdapter({
      cwd: "C:\\Users\\hanse\\GIT\\CodexRemote",
      transport
    });

    await adapter.sendMessage({
      message: "Inspect the shell",
      projectRoot: "C:\\Users\\hanse\\GIT\\CodexRemote",
      threadId: "thread-send-1"
    });

    expect(transport.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "thread/resume",
          params: expect.objectContaining({
            threadId: "thread-send-1"
          })
        }),
        expect.objectContaining({
          method: "turn/start",
          params: expect.objectContaining({
            threadId: "thread-send-1"
          })
        })
      ])
    );
  });
});
