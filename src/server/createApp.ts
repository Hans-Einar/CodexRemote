import express from "express";
import path from "node:path";

import { GitRepoRequiredError, GitService } from "../git/gitService";
import {
  ProjectNotFoundError,
  ProjectRegistry,
  ProjectRootInvalidError
} from "../projects/projectRegistry";
import type { CodexAdapter } from "../shared/contracts";
import { WorkspacePathError, WorkspaceService } from "../workspace/workspaceService";

interface CreateAppOptions {
  apiPort: number;
  codexAdapter: CodexAdapter;
  projectDbPath?: string;
  projectRegistry?: ProjectRegistry;
  vitePort: number;
  workspaceRoot: string;
}

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

export function createApp(options: CreateAppOptions) {
  const app = express();
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
  app.locals.projectRegistry = projectRegistry;

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

  app.get("/api/modes", (_request, response) => {
    response.json({
      adapterLabel: options.codexAdapter.label,
      mode: options.codexAdapter.mode,
      capabilities: options.codexAdapter.capabilities
    });
  });

  app.get("/api/sessions", async (_request, response) => {
    response.json({
      sessions: await options.codexAdapter.listSessions()
    });
  });

  app.get("/api/threads", async (request, response) => {
    const sessionId = request.query.sessionId;

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return sendError(response, 400, "SESSION_ID_REQUIRED", "A sessionId query is required.");
    }

    response.json({
      threads: await options.codexAdapter.listThreads(sessionId)
    });
  });

  app.get("/api/threads/:threadId", async (request, response) => {
    const thread = await options.codexAdapter.getThread(request.params.threadId);

    if (!thread) {
      return sendError(response, 404, "THREAD_NOT_FOUND", "The requested thread was not found.");
    }

    response.json(thread);
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

  return app;
}
