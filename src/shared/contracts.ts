export type ThreadMode = "attached" | "mirrored" | "fallback";
export type MessageRole = "system" | "user" | "assistant";

export interface AdapterCapabilities {
  supportsAttach: boolean;
  supportsStreaming: boolean;
  supportsWorkspaceHints: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  workspaceLabel?: string;
}

export interface ThreadSummary {
  id: string;
  mode: ThreadMode;
  title: string;
}

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  messages: ThreadMessage[];
}

export interface WorkspaceEntry {
  kind: "directory" | "file";
  name: string;
  relativePath: string;
}

export interface WorkspaceTreeNode extends WorkspaceEntry {
  id: string;
  children?: WorkspaceTreeNode[];
}

export interface WorkspaceTreeResponse {
  rootPath: string;
  nodes: WorkspaceTreeNode[];
}

export interface WorkspaceFile {
  relativePath: string;
  contentType: string;
  content: string;
  size: number;
}

export interface WorkspaceSaveResponse {
  relativePath: string;
  saved: true;
}

export interface ProjectRecord {
  browserIdeUrl: string | null;
  createdAt: string;
  id: string;
  name: string;
  rootPath: string;
  updatedAt: string;
}

export interface ProjectsResponse {
  defaultProjectId: string | null;
  projects: ProjectRecord[];
}

export interface GitStatusEntry {
  badges: string[];
  relativePath: string;
}

export interface GitStatusResponse {
  available: boolean;
  branch: string | null;
  branches: string[];
  dirtyCount: number;
  fileStatuses: GitStatusEntry[];
  folderStatuses: GitStatusEntry[];
  stagedCount: number;
  unstagedCount: number;
}

export interface GitCommitResponse {
  committed: true;
}

export interface GitCheckoutResponse {
  branch: string;
}

export interface GitCreateBranchResponse {
  branch: string;
  created: true;
}

export interface GitStageAllResponse {
  staged: true;
}

export interface ModesResponse {
  adapterLabel: string;
  mode: ThreadMode;
  capabilities: AdapterCapabilities;
}

export interface HealthResponse {
  status: "ok";
  adapterLabel: string;
  ports: {
    api: number;
    vite: number;
  };
}

export interface SessionsResponse {
  sessions: SessionSummary[];
}

export interface ThreadsResponse {
  threads: ThreadSummary[];
}

export interface ThreadResponse extends ThreadDetail {}

export interface CodexAdapter {
  readonly label: string;
  readonly mode: ThreadMode;
  readonly capabilities: AdapterCapabilities;
  listSessions(): Promise<SessionSummary[]>;
  listThreads(sessionId: string): Promise<ThreadSummary[]>;
  getThread(threadId: string): Promise<ThreadDetail | null>;
}
