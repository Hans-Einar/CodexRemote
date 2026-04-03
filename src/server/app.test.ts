import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import request from "supertest";

import { createFixtureCodexAdapter } from "../bridge/fixtureCodexAdapter";
import { DEFAULT_API_PORT, DEFAULT_VITE_PORT } from "../config/ports";
import { createApp } from "./createApp";

const execFile = promisify(execFileCallback);

async function createTempWorkspace() {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "codexremote-workspace-"));
  await fs.mkdir(path.join(rootPath, "docs"));
  await fs.mkdir(path.join(rootPath, "node_modules"));
  await fs.writeFile(path.join(rootPath, "README.md"), "# Overview\n\nBaseline boot is ready.\n", "utf8");
  await fs.writeFile(path.join(rootPath, "docs", "notes.md"), "# Notes\n\nWorkspace browsing works.\n", "utf8");
  await fs.writeFile(path.join(rootPath, "node_modules", "ignored.js"), "console.log('ignore');\n", "utf8");
  return rootPath;
}

async function runGit(args: string[], cwd: string) {
  await execFile("git", args, {
    cwd
  });
}

describe("createApp", () => {
  let auxiliaryApps: Array<ReturnType<typeof createApp>> = [];
  let projectDbPath: string;
  let workspaceRoot: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    workspaceRoot = await createTempWorkspace();
    projectDbPath = path.join(workspaceRoot, "codexremote.sqlite");
    auxiliaryApps = [];
    app = createApp({
      apiPort: DEFAULT_API_PORT,
      codexAdapter: createFixtureCodexAdapter(),
      projectDbPath,
      vitePort: DEFAULT_VITE_PORT,
      workspaceRoot
    });
  });

  afterEach(async () => {
    for (const auxiliaryApp of auxiliaryApps) {
      auxiliaryApp.locals.authStore.close();
      auxiliaryApp.locals.projectRegistry.close();
    }
    app.locals.authStore.close();
    app.locals.projectRegistry.close();
    await fs.rm(workspaceRoot, { force: true, recursive: true });
  });

  it("reports bridge health and reserved ports", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      ports: {
        api: DEFAULT_API_PORT,
        vite: DEFAULT_VITE_PORT
      }
    });
  });

  it("lists fixture-backed sessions", async () => {
    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "session-local-companion",
          title: "Local Companion Baseline"
        })
      ])
    );
  });

  it("returns runtime options and usage defaults for the active adapter", async () => {
    const response = await request(app).get("/api/runtime");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessModes: expect.arrayContaining(["read-only", "workspace-write", "danger-full-access"]),
      defaultAccessMode: "workspace-write",
      defaultModelId: "gpt-5.4",
      models: expect.arrayContaining([
        expect.objectContaining({
          id: "gpt-5.4"
        })
      ])
    });
  });

  it("creates and persists shared project records in SQLite", async () => {
    const secondWorkspace = await createTempWorkspace();

    const createResponse = await request(app).post("/api/projects").send({
      name: "Second Project",
      rootPath: secondWorkspace
    });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.name).toBe("Second Project");

    const reloadedApp = createApp({
      apiPort: DEFAULT_API_PORT,
      codexAdapter: createFixtureCodexAdapter(),
      projectDbPath,
      vitePort: DEFAULT_VITE_PORT,
      workspaceRoot
    });
    auxiliaryApps.push(reloadedApp);

    const listResponse = await request(reloadedApp).get("/api/projects");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Second Project",
          rootPath: secondWorkspace
        })
      ])
    );

    await fs.rm(secondWorkspace, { force: true, recursive: true });
  });

  it("returns a thread with ordered messages", async () => {
    const response = await request(app).get("/api/threads/thread-bridge-bootstrap");

    expect(response.status).toBe(200);
    expect(response.body.thread.id).toBe("thread-bridge-bootstrap");
    expect(response.body.messages[0]).toMatchObject({
      role: "system"
    });
  });

  it("supports tailed thread reads while preserving the full message count", async () => {
    const response = await request(app)
      .get("/api/threads/thread-bridge-bootstrap")
      .query({
        limit: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.messageCount).toBe(2);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({
      role: "assistant"
    });
  });

  it("sends a prompt through the thread route and returns the updated thread", async () => {
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;

    const response = await request(app).post("/api/threads/send").send({
      message: "Plan the next shell step",
      projectId,
      threadId: "thread-bridge-bootstrap"
    });

    expect(response.status).toBe(200);
    expect(response.body.thread.id).toBe("thread-bridge-bootstrap");
    expect(response.body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "Plan the next shell step",
          role: "user"
        }),
        expect.objectContaining({
          content: "Fixture adapter captured: Plan the next shell step",
          role: "assistant"
        })
      ])
    );
  });

  it("returns nested tree nodes and filters ignored directories", async () => {
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(app).get("/api/workspace/tree").query({
      projectId
    });

    expect(response.status).toBe(200);
    expect(response.body.rootPath).toBe(workspaceRoot);
    expect(response.body.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "docs",
          kind: "directory",
          name: "docs",
          children: [
            expect.objectContaining({
              id: "docs/notes.md",
              kind: "file",
              name: "notes.md"
            })
          ]
        }),
        expect.objectContaining({
          id: "README.md",
          kind: "file",
          name: "README.md"
        })
      ])
    );
    expect(response.body.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "node_modules"
        })
      ])
    );
  });

  it("reads markdown files from the workspace", async () => {
    const relativePath = path.join("docs", "notes.md");
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(app).get("/api/workspace/file").query({
      projectId,
      path: relativePath
    });

    expect(response.status).toBe(200);
    expect(response.body.relativePath).toBe("docs/notes.md");
    expect(response.body.content).toContain("Workspace browsing works.");
  });

  it("saves supported files back into the workspace", async () => {
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(app).put("/api/workspace/file").send({
      content: "# Overview\n\nSaved through the editor.\n",
      path: "README.md",
      projectId
    });

    expect(response.status).toBe(200);
    expect(response.body.relativePath).toBe("README.md");

    const savedContent = await fs.readFile(path.join(workspaceRoot, "README.md"), "utf8");
    expect(savedContent).toContain("Saved through the editor.");
  });

  it("reports graceful git status when the workspace is not a git repo", async () => {
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(app).get("/api/git/status").query({
      projectId
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: false,
      branch: null
    });
  });

  it("returns git status badges and branch information for git workspaces", async () => {
    await runGit(["init", "-b", "main"], workspaceRoot);
    await runGit(["config", "user.email", "codex@example.com"], workspaceRoot);
    await runGit(["config", "user.name", "Codex Remote"], workspaceRoot);
    await runGit(["add", "."], workspaceRoot);
    await runGit(["commit", "-m", "Initial baseline"], workspaceRoot);
    await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Overview\n\nModified file.\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "docs", "todo.md"), "- [ ] pending\n", "utf8");

    const gitApp = createApp({
      apiPort: DEFAULT_API_PORT,
      codexAdapter: createFixtureCodexAdapter(),
      projectDbPath,
      vitePort: DEFAULT_VITE_PORT,
      workspaceRoot
    });
    auxiliaryApps.push(gitApp);

    const projectsResponse = await request(gitApp).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(gitApp).get("/api/git/status").query({
      projectId
    });

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.branch).toBe("main");
    expect(response.body.fileStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          additions: 1,
          badges: expect.arrayContaining(["M"]),
          deletions: 1,
          relativePath: "README.md"
        }),
        expect.objectContaining({
          additions: 1,
          badges: expect.arrayContaining(["?"]),
          deletions: 0,
          relativePath: "docs/todo.md"
        })
      ])
    );
    expect(response.body.folderStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          badges: expect.arrayContaining(["?1"]),
          relativePath: "docs"
        })
      ])
    );
  });

  it("returns a repository diff for changed files", async () => {
    await runGit(["init", "-b", "main"], workspaceRoot);
    await runGit(["config", "user.email", "codex@example.com"], workspaceRoot);
    await runGit(["config", "user.name", "Codex Remote"], workspaceRoot);
    await runGit(["add", "."], workspaceRoot);
    await runGit(["commit", "-m", "Initial baseline"], workspaceRoot);
    await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Overview\n\nDiff preview content.\n", "utf8");

    const gitApp = createApp({
      apiPort: DEFAULT_API_PORT,
      codexAdapter: createFixtureCodexAdapter(),
      projectDbPath,
      vitePort: DEFAULT_VITE_PORT,
      workspaceRoot
    });
    auxiliaryApps.push(gitApp);

    const projectsResponse = await request(gitApp).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(gitApp).get("/api/git/diff").query({
      path: "README.md",
      projectId
    });

    expect(response.status).toBe(200);
    expect(response.body.relativePath).toBe("README.md");
    expect(response.body.diff).toContain("Diff preview content.");
  });

  it("supports a basic git workflow for stage, commit, branch create, and checkout", async () => {
    await runGit(["init", "-b", "main"], workspaceRoot);
    await runGit(["config", "user.email", "codex@example.com"], workspaceRoot);
    await runGit(["config", "user.name", "Codex Remote"], workspaceRoot);
    await runGit(["add", "."], workspaceRoot);
    await runGit(["commit", "-m", "Initial baseline"], workspaceRoot);
    await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Overview\n\nGit workflow.\n", "utf8");

    const gitApp = createApp({
      apiPort: DEFAULT_API_PORT,
      codexAdapter: createFixtureCodexAdapter(),
      projectDbPath,
      vitePort: DEFAULT_VITE_PORT,
      workspaceRoot
    });
    auxiliaryApps.push(gitApp);

    const projectsResponse = await request(gitApp).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;

    const stageResponse = await request(gitApp).post("/api/git/stage-all").send({
      projectId
    });
    expect(stageResponse.status).toBe(200);

    const commitResponse = await request(gitApp).post("/api/git/commit").send({
      message: "Update README",
      projectId
    });
    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.committed).toBe(true);

    const createBranchResponse = await request(gitApp).post("/api/git/branches").send({
      name: "feature/ui",
      projectId
    });
    expect(createBranchResponse.status).toBe(200);

    const checkoutResponse = await request(gitApp).post("/api/git/checkout").send({
      branch: "feature/ui",
      projectId
    });
    expect(checkoutResponse.status).toBe(200);
    expect(checkoutResponse.body.branch).toBe("feature/ui");
  });

  it("blocks path traversal outside the workspace root", async () => {
    const projectsResponse = await request(app).get("/api/projects");
    const projectId = projectsResponse.body.defaultProjectId as string;
    const response = await request(app).get("/api/workspace/file").query({
      projectId,
      path: "..\\secret.txt"
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("WORKSPACE_PATH_OUTSIDE_ROOT");
  });
});
