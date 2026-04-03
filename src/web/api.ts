import type {
  AuthConfigResponse,
  AuthMeResponse,
  AuthUserRecord,
  AuthUsersResponse,
  GitCheckoutResponse,
  GitCommitResponse,
  GitCreateBranchResponse,
  GitDiffResponse,
  GitPullResponse,
  GitPushResponse,
  GitStageAllResponse,
  GitStatusResponse,
  HealthResponse,
  ModesResponse,
  ProjectThreadState,
  ProjectRecord,
  ProjectsResponse,
  ReasoningEffortLevel,
  RuntimeAccessMode,
  RuntimeInfoResponse,
  SessionsResponse,
  ThreadResponse,
  ThreadsResponse,
  WorkspaceFile,
  WorkspaceSaveResponse,
  WorkspaceTreeResponse
} from "../shared/contracts";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Keep the default message when no JSON body is available.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function workspaceFileUrl(relativePath: string) {
  return `/api/workspace/file?path=${encodeURIComponent(relativePath)}`;
}

function projectSearch(projectId: string) {
  return `projectId=${encodeURIComponent(projectId)}`;
}

export function getHealth() {
  return fetchJson<HealthResponse>("/api/health");
}

export function getAuthConfig() {
  return fetchJson<AuthConfigResponse>("/api/auth/config");
}

export function getAuthMe() {
  return fetchJson<AuthMeResponse>("/api/auth/me");
}

export function logoutAuthSession() {
  return fetchJson<{ loggedOut: true }>("/api/auth/logout", {
    body: JSON.stringify({}),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function getAuthUsers() {
  return fetchJson<AuthUsersResponse>("/api/auth/users");
}

export function updateAuthUser(
  userId: string,
  updates: { isAdmin?: boolean; isAllowed?: boolean }
) {
  return fetchJson<AuthUserRecord>(`/api/auth/users/${encodeURIComponent(userId)}`, {
    body: JSON.stringify(updates),
    headers: {
      "Content-Type": "application/json"
    },
    method: "PATCH"
  });
}

export function getModes() {
  return fetchJson<ModesResponse>("/api/modes");
}

export function getRuntimeInfo() {
  return fetchJson<RuntimeInfoResponse>("/api/runtime");
}

export function getSessions(projectId?: string) {
  return fetchJson<SessionsResponse>(
    projectId ? `/api/sessions?${projectSearch(projectId)}` : "/api/sessions"
  );
}

export function getProjects() {
  return fetchJson<ProjectsResponse>("/api/projects");
}

export function createProject(project: {
  browserIdeUrl?: string | null;
  name: string;
  rootPath: string;
}) {
  return fetchJson<ProjectRecord>("/api/projects", {
    body: JSON.stringify(project),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function getThreads(sessionId: string, projectId?: string) {
  const base = `/api/threads?sessionId=${encodeURIComponent(sessionId)}`;
  return fetchJson<ThreadsResponse>(projectId ? `${base}&${projectSearch(projectId)}` : base);
}

export function getProjectThreadState(projectId: string) {
  return fetchJson<ProjectThreadState>(`/api/projects/${encodeURIComponent(projectId)}/thread-state`);
}

export function setProjectThreadState(
  projectId: string,
  activeThreadId: string | null,
  activeThreadUpdatedAt?: string | null
) {
  return fetchJson<ProjectThreadState>(
    `/api/projects/${encodeURIComponent(projectId)}/thread-state`,
    {
      body: JSON.stringify({
        activeThreadId,
        activeThreadUpdatedAt: activeThreadUpdatedAt ?? null
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PUT"
    }
  );
}

export function getThread(threadId: string, limit?: number) {
  const params = new URLSearchParams();
  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  const query = params.toString();
  return fetchJson<ThreadResponse>(
    `/api/threads/${encodeURIComponent(threadId)}${query ? `?${query}` : ""}`
  );
}

export function sendThreadMessage(
  projectId: string,
  message: string,
  threadId?: string | null,
  options?: {
    accessMode?: RuntimeAccessMode;
    model?: string | null;
    reasoningEffort?: ReasoningEffortLevel | null;
  }
) {
  return fetchJson<ThreadResponse>("/api/threads/send", {
    body: JSON.stringify({
      accessMode: options?.accessMode,
      message,
      model: options?.model ?? null,
      projectId,
      reasoningEffort: options?.reasoningEffort ?? null,
      threadId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function getWorkspaceTree(projectId: string) {
  return fetchJson<WorkspaceTreeResponse>(`/api/workspace/tree?${projectSearch(projectId)}`);
}

export function getWorkspaceFile(projectId: string, relativePath: string) {
  return fetchJson<WorkspaceFile>(`${workspaceFileUrl(relativePath)}&${projectSearch(projectId)}`);
}

export function saveWorkspaceFile(projectId: string, path: string, content: string) {
  return fetchJson<WorkspaceSaveResponse>("/api/workspace/file", {
    body: JSON.stringify({
      content,
      path,
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "PUT"
  });
}

export function getGitStatus(projectId: string) {
  return fetchJson<GitStatusResponse>(`/api/git/status?${projectSearch(projectId)}`);
}

export function getGitDiff(projectId: string, relativePath: string) {
  return fetchJson<GitDiffResponse>(
    `/api/git/diff?path=${encodeURIComponent(relativePath)}&${projectSearch(projectId)}`
  );
}

export function stageAllGitChanges(projectId: string) {
  return fetchJson<GitStageAllResponse>("/api/git/stage-all", {
    body: JSON.stringify({
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function commitGitChanges(projectId: string, message: string) {
  return fetchJson<GitCommitResponse>("/api/git/commit", {
    body: JSON.stringify({
      message,
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function checkoutGitBranch(projectId: string, branch: string) {
  return fetchJson<GitCheckoutResponse>("/api/git/checkout", {
    body: JSON.stringify({
      branch,
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function createGitBranch(projectId: string, name: string) {
  return fetchJson<GitCreateBranchResponse>("/api/git/branches", {
    body: JSON.stringify({
      name,
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function pullGitChanges(projectId: string) {
  return fetchJson<GitPullResponse>("/api/git/pull", {
    body: JSON.stringify({
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

export function pushGitChanges(projectId: string) {
  return fetchJson<GitPushResponse>("/api/git/push", {
    body: JSON.stringify({
      projectId
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}
