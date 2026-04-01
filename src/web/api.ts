import type {
  GitCheckoutResponse,
  GitCommitResponse,
  GitCreateBranchResponse,
  GitStageAllResponse,
  GitStatusResponse,
  HealthResponse,
  ModesResponse,
  ProjectRecord,
  ProjectsResponse,
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

export function getModes() {
  return fetchJson<ModesResponse>("/api/modes");
}

export function getSessions() {
  return fetchJson<SessionsResponse>("/api/sessions");
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

export function getThreads(sessionId: string) {
  return fetchJson<ThreadsResponse>(`/api/threads?sessionId=${encodeURIComponent(sessionId)}`);
}

export function getThread(threadId: string) {
  return fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(threadId)}`);
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
