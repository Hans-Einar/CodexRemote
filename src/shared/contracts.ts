export type ThreadMode = "attached" | "mirrored" | "fallback";
export type MessageRole = "system" | "user" | "assistant";
export type ReasoningEffortLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RuntimeAccessMode = "read-only" | "workspace-write" | "danger-full-access";

export interface AdapterCapabilities {
  supportsAttach: boolean;
  supportsSend: boolean;
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
  updatedAt?: string | null;
}

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  turnId?: string | null;
}

export interface ThreadFileChange {
  diff: string | null;
  path: string;
}

export interface ThreadActivityEntry {
  detail: string | null;
  durationMs: number | null;
  files: string[];
  fileChanges: ThreadFileChange[];
  id: string;
  itemId?: string | null;
  kind: "command" | "file_change" | "plan" | "reasoning" | "tool" | "web";
  status: string | null;
  title: string;
  turnId?: string | null;
}

export interface ThreadLiveEvent {
  detail: string | null;
  files: string[];
  fileChanges: ThreadFileChange[];
  groupId: string;
  id: string;
  itemId: string | null;
  kind:
    | "agent_delta"
    | "file_change_delta"
    | "item_completed"
    | "item_started"
    | "plan_delta"
    | "reasoning_delta"
    | "reasoning_summary_delta"
    | "token_usage"
    | "turn_completed"
    | "turn_started";
  status: string | null;
  threadId: string;
  title: string;
  tokenUsageSummary: string | null;
  turnId: string | null;
}

export interface ThreadDetail {
  activities: ThreadActivityEntry[];
  messageCount: number;
  thread: ThreadSummary;
  messages: ThreadMessage[];
}

export interface ThreadSendRequest {
  message: string;
  projectRoot?: string;
  accessMode?: RuntimeAccessMode;
  model?: string | null;
  reasoningEffort?: ReasoningEffortLevel | null;
  threadId?: string | null;
}

export interface RuntimeModelOption {
  defaultReasoningEffort: ReasoningEffortLevel;
  description: string;
  displayName: string;
  id: string;
  isDefault: boolean;
  supportedReasoningEfforts: ReasoningEffortLevel[];
}

export interface RuntimeUsageStatus {
  creditsBalance: string | null;
  creditsUnlimited: boolean;
  limitName: string | null;
  planType: string | null;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
}

export interface RuntimeInfoResponse {
  accessModes: RuntimeAccessMode[];
  defaultAccessMode: RuntimeAccessMode;
  defaultModelId: string | null;
  defaultReasoningEffort: ReasoningEffortLevel | null;
  models: RuntimeModelOption[];
  usage: RuntimeUsageStatus | null;
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

export interface ProjectThreadState {
  activeThreadId: string | null;
  activeThreadUpdatedAt: string | null;
  selectionSource: string;
  updatedAt: string | null;
}

export interface AuthUserRecord {
  email: string;
  id: string;
  isAdmin: boolean;
  isAllowed: boolean;
  name: string;
  pictureUrl: string | null;
}

export interface AuthConfigResponse {
  configured: boolean;
  enabled: boolean;
}

export interface AuthMeResponse extends AuthConfigResponse {
  authenticated: boolean;
  user: AuthUserRecord | null;
}

export interface AuthUsersResponse {
  users: AuthUserRecord[];
}

export interface GitStatusEntry {
  additions: number;
  badges: string[];
  deletions: number;
  relativePath: string;
  staged: boolean;
  unstaged: boolean;
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

export interface GitDiffResponse {
  diff: string;
  relativePath: string;
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

export interface GitPushResponse {
  pushed: true;
}

export interface GitPullResponse {
  pulled: true;
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
  activeThreadId?: string | null;
  threads: ThreadSummary[];
}

export interface ThreadResponse extends ThreadDetail {}

export interface CodexAdapter {
  readonly label: string;
  readonly mode: ThreadMode;
  readonly capabilities: AdapterCapabilities;
  listSessions(projectRoot?: string): Promise<SessionSummary[]>;
  listThreads(sessionId: string, projectRoot?: string): Promise<ThreadSummary[]>;
  getThread(threadId: string): Promise<ThreadDetail | null>;
  getRuntimeInfo(): Promise<RuntimeInfoResponse>;
  subscribeToThreadEvents(
    threadId: string,
    listener: (event: ThreadLiveEvent) => void
  ): () => void;
  sendMessage(request: ThreadSendRequest): Promise<ThreadDetail>;
}
