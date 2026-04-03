import express from "express";
import path from "node:path";

import { getAuthConfigFromEnv, isAuthConfigured, type AuthConfig } from "../auth/authConfig";
import { AuthStore } from "../auth/authStore";
import { GoogleOAuthClient, type GoogleAuthClient } from "../auth/googleAuth";
import { GitPathError, GitRepoRequiredError, GitService } from "../git/gitService";
import {
  ProjectNotFoundError,
  ProjectRegistry,
  ProjectRootInvalidError
} from "../projects/projectRegistry";
import type { CodexAdapter } from "../shared/contracts";
import { WorkspacePathError, WorkspaceService } from "../workspace/workspaceService";

interface CreateAppOptions {
  apiPort: number;
  authConfig?: AuthConfig;
  authStore?: AuthStore;
  codexAdapter: CodexAdapter;
  googleAuthClient?: GoogleAuthClient;
  projectDbPath?: string;
  projectRegistry?: ProjectRegistry;
  vitePort: number;
  workspaceRoot: string;
}

const SESSION_COOKIE_NAME = "codexremote_session";

function sendError(
  response: express.Response,
  status: number,
  code: string,
  message: string
) {
  return response.status(status).json({
    error: {
      code,
      message
    }
  });
}

function parseCookies(headerValue: string | undefined) {
  const cookies = new Map<string, string>();

  if (!headerValue) {
    return cookies;
  }

  for (const cookie of headerValue.split(";")) {
    const [name, ...rest] = cookie.trim().split("=");
    if (!name) {
      continue;
    }
    cookies.set(name, decodeURIComponent(rest.join("=")));
  }

  return cookies;
}

export function createApp(options: CreateAppOptions) {
  const app = express();
  const authConfig = options.authConfig ?? getAuthConfigFromEnv();
  const authEnabled = authConfig.mode === "required";
  const authConfigured = isAuthConfigured(authConfig);
  const authStore =
    options.authStore ??
    new AuthStore(
      options.projectDbPath ??
        path.join(options.workspaceRoot, "data", "codexremote.sqlite")
    );
  const googleAuthClient =
    options.googleAuthClient ??
    (authConfigured ? new GoogleOAuthClient(authConfig) : null);
  const projectRegistry =
    options.projectRegistry ??
    new ProjectRegistry({
      dbPath:
        options.projectDbPath ??
        path.join(options.workspaceRoot, "data", "codexremote.sqlite"),
      seedProject: {
        name: path.basename(options.workspaceRoot) || "Current Workspace",
        rootPath: options.workspaceRoot
      }
    });

  app.use(express.json());
  app.locals.authConfig = authConfig;
  app.locals.authStore = authStore;
  app.locals.projectRegistry = projectRegistry;

  function getAuthenticatedUser(request: express.Request) {
    if (!authEnabled) {
      return null;
    }

    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);
    return token ? authStore.getUserBySessionToken(token) : null;
  }

  function resolveProject(projectId?: string) {
    return projectRegistry.resolveProject(projectId);
  }

  function workspaceServiceForProject(projectId?: string) {
    return new WorkspaceService(resolveProject(projectId).rootPath);
  }

  function gitServiceForProject(projectId?: string) {
    return new GitService(resolveProject(projectId).rootPath);
  }

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      adapterLabel: options.codexAdapter.label,
      ports: {
        api: options.apiPort,
        vite: options.vitePort
      }
    });
  });

  app.get("/api/auth/config", (_request, response) => {
    response.json({
      configured: authConfigured,
      enabled: authEnabled
    });
  });

  app.get("/api/auth/me", (request, response) => {
    const user = getAuthenticatedUser(request);

    response.json({
      authenticated: Boolean(user),
      configured: authConfigured,
      enabled: authEnabled,
      user
    });
  });

  app.post("/api/auth/logout", (request, response) => {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);

    if (token) {
      authStore.deleteSession(token);
    }

    response.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    response.json({
      loggedOut: true
    });
  });

  app.get("/api/auth/google/start", (_request, response) => {
    if (!authEnabled || !authConfigured || !googleAuthClient) {
      return sendError(response, 400, "AUTH_NOT_CONFIGURED", "Google OAuth is not configured.");
    }

    const state = authStore.createOauthState();
    response.redirect(302, googleAuthClient.getAuthorizationUrl(state));
  });

  app.get("/api/auth/google/callback", async (request, response) => {
    if (!authEnabled || !authConfigured || !googleAuthClient) {
      return sendError(response, 400, "AUTH_NOT_CONFIGURED", "Google OAuth is not configured.");
    }

    const code = typeof request.query.code === "string" ? request.query.code : null;
    const state = typeof request.query.state === "string" ? request.query.state : null;

    if (!code || !state || !authStore.consumeOauthState(state)) {
      return sendError(response, 400, "AUTH_STATE_INVALID", "The Google OAuth state was invalid.");
    }

    try {
      const profile = await googleAuthClient.fetchUserProfile(code);
      const user = authStore.upsertGoogleUser(profile, authConfig.bootstrapAdminEmails);

      if (!user.isAllowed) {
        return sendError(response, 403, "AUTH_USER_NOT_ALLOWED", "This user is not allowed to access CodexRemote.");
      }

      const session = authStore.createSession(user.id);
      response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`
      );
      response.redirect(302, "/");
    } catch (error) {
      return sendError(
        response,
        400,
        "AUTH_CALLBACK_FAILED",
        error instanceof Error ? error.message : "Google OAuth callback failed."
      );
    }
  });

  app.use("/api", (request, response, next) => {
    if (!authEnabled) {
      return next();
    }

    if (request.path.startsWith("/auth/")) {
      return next();
    }

    const user = getAuthenticatedUser(request);

    if (!user) {
      return sendError(response, 401, "AUTH_REQUIRED", "You must sign in to access CodexRemote.");
    }

    if (!user.isAllowed) {
      return sendError(response, 403, "AUTH_USER_NOT_ALLOWED", "This user is not allowed to access CodexRemote.");
    }

    response.locals.authUser = user;
    next();
  });

  app.get("/api/auth/users", (request, response) => {
    const user = response.locals.authUser;

    if (!user?.isAdmin) {
      return sendError(response, 403, "ADMIN_REQUIRED", "Admin access is required.");
    }

    response.json({
      users: authStore.listUsers()
    });
  });

  app.patch("/api/auth/users/:userId", (request, response) => {
    const user = response.locals.authUser;

    if (!user?.isAdmin) {
      return sendError(response, 403, "ADMIN_REQUIRED", "Admin access is required.");
    }

    const body = request.body as {
      isAdmin?: unknown;
      isAllowed?: unknown;
    };

    const updated = authStore.updateUserAccess(request.params.userId, {
      isAdmin: typeof body.isAdmin === "boolean" ? body.isAdmin : undefined,
      isAllowed: typeof body.isAllowed === "boolean" ? body.isAllowed : undefined
    });

    if (!updated) {
      return sendError(response, 404, "AUTH_USER_NOT_FOUND", "The requested user was not found.");
    }

    response.json(updated);
  });

  app.get("/api/projects", (_request, response) => {
    response.json(projectRegistry.listProjects());
  });

  app.post("/api/projects", (request, response) => {
    const body = request.body as {
      browserIdeUrl?: unknown;
      name?: unknown;
      rootPath?: unknown;
    };

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return sendError(response, 400, "PROJECT_NAME_REQUIRED", "A project name is required.");
    }

    if (typeof body.rootPath !== "string" || body.rootPath.trim().length === 0) {
      return sendError(response, 400, "PROJECT_ROOT_REQUIRED", "A project root path is required.");
    }

    try {
      response.json(
        projectRegistry.createProject({
          browserIdeUrl: typeof body.browserIdeUrl === "string" ? body.browserIdeUrl.trim() : null,
          name: body.name,
          rootPath: body.rootPath
        })
      );
    } catch (error) {
      if (error instanceof ProjectRootInvalidError) {
        return sendError(response, 400, "PROJECT_ROOT_INVALID", error.message);
      }

      throw error;
    }
  });

  app.get("/api/projects/:projectId/thread-state", (request, response) => {
    try {
      response.json(projectRegistry.getProjectThreadState(request.params.projectId));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.put("/api/projects/:projectId/thread-state", (request, response) => {
    const body = request.body as {
      activeThreadId?: unknown;
      activeThreadUpdatedAt?: unknown;
    };

    try {
      response.json(
        projectRegistry.setProjectThreadState(request.params.projectId, {
          activeThreadId:
            typeof body.activeThreadId === "string" ? body.activeThreadId : null,
          activeThreadUpdatedAt:
            typeof body.activeThreadUpdatedAt === "string" ? body.activeThreadUpdatedAt : null,
          selectionSource: "web_ui"
        })
      );
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/modes", (_request, response) => {
    response.json({
      adapterLabel: options.codexAdapter.label,
      mode: options.codexAdapter.mode,
      capabilities: options.codexAdapter.capabilities
    });
  });

  app.get("/api/runtime", async (_request, response) => {
    response.json(await options.codexAdapter.getRuntimeInfo());
  });

  app.get("/api/sessions", async (_request, response) => {
    try {
      const projectId =
        typeof _request.query.projectId === "string" ? _request.query.projectId : undefined;
      const projectRoot = projectId ? resolveProject(projectId).rootPath : undefined;

      response.json({
        sessions: await options.codexAdapter.listSessions(projectRoot)
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/threads", async (request, response) => {
    const sessionId = request.query.sessionId;

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return sendError(response, 400, "SESSION_ID_REQUIRED", "A sessionId query is required.");
    }

    try {
      const projectId =
        typeof request.query.projectId === "string" ? request.query.projectId : undefined;
      const projectRoot = projectId ? resolveProject(projectId).rootPath : undefined;
      const threads = await options.codexAdapter.listThreads(sessionId, projectRoot);
      const threadState = projectId
        ? projectRegistry.reconcileProjectThreadState(projectId, threads)
        : null;

      response.json({
        activeThreadId: threadState?.activeThreadId ?? null,
        threads
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/threads/:threadId", async (request, response) => {
    const thread = await options.codexAdapter.getThread(request.params.threadId);
    const limitRaw = typeof request.query.limit === "string" ? Number(request.query.limit) : null;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : null;

    if (!thread) {
      return sendError(response, 404, "THREAD_NOT_FOUND", "The requested thread was not found.");
    }

    response.json({
      ...thread,
      messages: limit ? thread.messages.slice(-limit) : thread.messages
    });
  });

  app.get("/api/threads/:threadId/events", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const unsubscribe = options.codexAdapter.subscribeToThreadEvents(
      request.params.threadId,
      (event) => {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    response.write("retry: 1000\n\n");

    const heartbeat = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 15000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });

  app.post("/api/threads/send", async (request, response) => {
    const body = request.body as {
      accessMode?: unknown;
      message?: unknown;
      model?: unknown;
      projectId?: unknown;
      reasoningEffort?: unknown;
      threadId?: unknown;
    };

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return sendError(response, 400, "THREAD_MESSAGE_REQUIRED", "A message is required.");
    }

    try {
      const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
      const projectRoot = projectId ? resolveProject(projectId).rootPath : undefined;
      const thread = await options.codexAdapter.sendMessage({
        accessMode:
          body.accessMode === "read-only" ||
          body.accessMode === "workspace-write" ||
          body.accessMode === "danger-full-access"
            ? body.accessMode
            : undefined,
        message: body.message.trim(),
        model: typeof body.model === "string" ? body.model : null,
        projectRoot,
        reasoningEffort:
          body.reasoningEffort === "none" ||
          body.reasoningEffort === "minimal" ||
          body.reasoningEffort === "low" ||
          body.reasoningEffort === "medium" ||
          body.reasoningEffort === "high" ||
          body.reasoningEffort === "xhigh"
            ? body.reasoningEffort
            : null,
        threadId: typeof body.threadId === "string" ? body.threadId : null
      });

      response.json(thread);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      return sendError(
        response,
        502,
        "THREAD_SEND_FAILED",
        error instanceof Error ? error.message : "Failed to send the message to Codex."
      );
    }
  });

  app.get("/api/workspace/tree", async (_request, response) => {
    try {
      const projectId = typeof _request.query.projectId === "string" ? _request.query.projectId : undefined;
      response.json(await workspaceServiceForProject(projectId).getTree());
    } catch (error) {
      if (error instanceof WorkspacePathError) {
        return sendError(response, 400, error.code, error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/workspace/file", async (request, response) => {
    const relativePath = request.query.path;

    if (typeof relativePath !== "string" || relativePath.length === 0) {
      return sendError(response, 400, "WORKSPACE_PATH_REQUIRED", "A file path query is required.");
    }

    try {
      const projectId = typeof request.query.projectId === "string" ? request.query.projectId : undefined;
      response.json(await workspaceServiceForProject(projectId).readFile(relativePath));
    } catch (error) {
      if (error instanceof WorkspacePathError) {
        return sendError(response, 400, error.code, error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.put("/api/workspace/file", async (request, response) => {
    const body = request.body as {
      content?: unknown;
      path?: unknown;
      projectId?: unknown;
    };

    if (typeof body.path !== "string" || body.path.length === 0) {
      return sendError(response, 400, "WORKSPACE_PATH_REQUIRED", "A file path is required.");
    }

    if (typeof body.content !== "string") {
      return sendError(
        response,
        400,
        "WORKSPACE_CONTENT_REQUIRED",
        "A string content payload is required."
      );
    }

    try {
      response.json(
        await workspaceServiceForProject(
          typeof body.projectId === "string" ? body.projectId : undefined
        ).writeFile(body.path, body.content)
      );
    } catch (error) {
      if (error instanceof WorkspacePathError) {
        return sendError(response, 400, error.code, error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/git/status", async (request, response) => {
    try {
      const projectId = typeof request.query.projectId === "string" ? request.query.projectId : undefined;
      response.json(await gitServiceForProject(projectId).getStatus());
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.get("/api/git/diff", async (request, response) => {
    const projectId = typeof request.query.projectId === "string" ? request.query.projectId : undefined;
    const relativePath = typeof request.query.path === "string" ? request.query.path : "";

    if (relativePath.trim().length === 0) {
      return sendError(response, 400, "GIT_PATH_REQUIRED", "A repository-relative path is required.");
    }

    try {
      response.json(await gitServiceForProject(projectId).getDiff(relativePath.trim()));
    } catch (error) {
      if (error instanceof GitPathError) {
        return sendError(response, 400, "GIT_PATH_INVALID", error.message);
      }

      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/stage-all", async (request, response) => {
    try {
      response.json(
        await gitServiceForProject(
          typeof request.body?.projectId === "string" ? request.body.projectId : undefined
        ).stageAll()
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/commit", async (request, response) => {
    const body = request.body as {
      message?: unknown;
      projectId?: unknown;
    };

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return sendError(response, 400, "GIT_COMMIT_MESSAGE_REQUIRED", "A commit message is required.");
    }

    try {
      response.json(
        await gitServiceForProject(
          typeof body.projectId === "string" ? body.projectId : undefined
        ).commit(body.message.trim())
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/checkout", async (request, response) => {
    const body = request.body as {
      branch?: unknown;
      projectId?: unknown;
    };

    if (typeof body.branch !== "string" || body.branch.trim().length === 0) {
      return sendError(response, 400, "GIT_BRANCH_REQUIRED", "A branch name is required.");
    }

    try {
      response.json(
        await gitServiceForProject(
          typeof body.projectId === "string" ? body.projectId : undefined
        ).checkout(body.branch.trim())
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/branches", async (request, response) => {
    const body = request.body as {
      name?: unknown;
      projectId?: unknown;
    };

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return sendError(response, 400, "GIT_BRANCH_NAME_REQUIRED", "A branch name is required.");
    }

    try {
      response.json(
        await gitServiceForProject(
          typeof body.projectId === "string" ? body.projectId : undefined
        ).createBranch(body.name.trim())
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/pull", async (request, response) => {
    try {
      response.json(
        await gitServiceForProject(
          typeof request.body?.projectId === "string" ? request.body.projectId : undefined
        ).pull()
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  app.post("/api/git/push", async (request, response) => {
    try {
      response.json(
        await gitServiceForProject(
          typeof request.body?.projectId === "string" ? request.body.projectId : undefined
        ).push()
      );
    } catch (error) {
      if (error instanceof GitRepoRequiredError) {
        return sendError(response, 400, "GIT_REPO_REQUIRED", error.message);
      }

      if (error instanceof ProjectNotFoundError) {
        return sendError(response, 404, "PROJECT_NOT_FOUND", error.message);
      }

      throw error;
    }
  });

  return app;
}
