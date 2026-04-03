import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import ReactMarkdown from "react-markdown";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle
} from "react-resizable-panels";
import codexRemoteLogoUrl from "../../logo.png";

import {
  getAuthConfig,
  getAuthMe,
  getAuthUsers,
  checkoutGitBranch,
  commitGitChanges,
  createGitBranch,
  createProject,
  getGitDiff,
  getGitStatus,
  getHealth,
  getModes,
  getProjects,
  getRuntimeInfo,
  getSessions,
  getThread,
  getThreads,
  getWorkspaceFile,
  getWorkspaceTree,
  logoutAuthSession,
  pullGitChanges,
  pushGitChanges,
  saveWorkspaceFile,
  sendThreadMessage,
  setProjectThreadState,
  stageAllGitChanges,
  updateAuthUser
} from "./api";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { TerminalPane } from "./TerminalPane";
import type {
  AuthUserRecord,
  GitStatusEntry,
  GitStatusResponse,
  HealthResponse,
  ModesResponse,
  ProjectRecord,
  ReasoningEffortLevel,
  RuntimeAccessMode,
  RuntimeInfoResponse,
  ThreadActivityEntry,
  ThreadLiveEvent,
  ThreadMessage,
  ThreadResponse,
  ThreadSummary,
  WorkspaceFile,
  WorkspaceTreeNode,
  WorkspaceTreeResponse
} from "../shared/contracts";

type FocusMode = "agent" | "workspace";
type MarkdownViewMode = "preview" | "source";

const DEFAULT_THREAD_MESSAGE_LIMIT = 24;
const THREAD_MESSAGE_LIMIT_STEP = 20;
const LIVE_POLL_INTERVAL_MS = 4000;

interface AppState {
  authenticatedUser: AuthUserRecord | null;
  authConfigured: boolean;
  authEnabled: boolean;
  gitStatus: GitStatusResponse | null;
  health: HealthResponse | null;
  modes: ModesResponse | null;
  projects: ProjectRecord[];
  runtimeInfo: RuntimeInfoResponse | null;
  selectedProjectId: string | null;
  sessions: Array<{ id: string; title: string; workspaceLabel?: string }>;
  threads: ThreadSummary[];
  activeSessionId: string | null;
  activeThreadId: string | null;
  activeThread: ThreadResponse | null;
  activeDiff: {
    diff: string;
    relativePath: string;
  } | null;
  workspaceTree: WorkspaceTreeResponse | null;
  activeFile: WorkspaceFile | null;
  editorContent: string;
  saveState: "idle" | "dirty" | "saved" | "saving";
  users: AuthUserRecord[];
  error: string | null;
  busyLabel: string | null;
}

interface StatusPillProps {
  label: string;
  tone?: "accent" | "neutral" | "warning";
}

interface ThreadListProps {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  threads: ThreadSummary[];
}

interface FilePaneProps {
  diffView: {
    diff: string;
    relativePath: string;
  } | null;
  editorContent: string;
  file: WorkspaceFile | null;
  markdownViewMode: MarkdownViewMode;
  onChange: (value: string) => void;
  onSave: () => void;
  onShowPreview: () => void;
  onShowSource: () => void;
}

interface GitSidePanelProps {
  activeDiffPath: string | null;
  defaultExpandedIds: string[];
  fileBadgeMap: Map<string, string[]>;
  folderBadgeMap: Map<string, string[]>;
  gitStatus: GitStatusResponse | null;
  nodes: WorkspaceTreeNode[];
  onOpenControls: () => void;
  onOpenDiff: (relativePath: string) => void;
}

interface GitControlsOverlayProps {
  commitMessage: string;
  gitStatus: GitStatusResponse | null;
  onClose: () => void;
  onCheckout: () => void;
  onCommitMessageChange: (value: string) => void;
  onCommit: () => void;
  onCreateBranchDialogOpen: () => void;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  onSelectedBranchChange: (value: string) => void;
  onStageAll: () => void;
  selectedBranch: string;
  stagedFiles: GitStatusEntry[];
}

interface BranchDialogProps {
  branchDraft: string;
  onBranchDraftChange: (value: string) => void;
  onClose: () => void;
  onCreateBranch: () => void;
}

interface ProjectPanelProps {
  addProjectExpanded: boolean;
  browserIdeUrl: string | null;
  browserIdeDraft: string;
  nameDraft: string;
  onAddProject: () => void;
  onBrowserIdeDraftChange: (value: string) => void;
  onNameDraftChange: (value: string) => void;
  onRootPathDraftChange: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleAddProject: () => void;
  projects: ProjectRecord[];
  rootPathDraft: string;
  selectedProject: ProjectRecord | null;
  selectedProjectId: string | null;
}

interface AccessPanelProps {
  currentUser: AuthUserRecord;
  onLogout: () => void;
  onToggleAdmin: (user: AuthUserRecord) => void;
  onToggleAllowed: (user: AuthUserRecord) => void;
  users: AuthUserRecord[];
}

const initialState: AppState = {
  authenticatedUser: null,
  authConfigured: false,
  authEnabled: false,
  gitStatus: null,
  health: null,
  modes: null,
  projects: [],
  runtimeInfo: null,
  selectedProjectId: null,
  sessions: [],
  threads: [],
  activeSessionId: null,
  activeThreadId: null,
  activeThread: null,
  activeDiff: null,
  workspaceTree: null,
  activeFile: null,
  editorContent: "",
  saveState: "idle",
  users: [],
  error: null,
  busyLabel: null
};

function gitAncestorsForPath(relativePath: string) {
  const fragments = relativePath.split("/").filter(Boolean);
  const ancestors: string[] = [];

  for (let index = 1; index < fragments.length; index += 1) {
    ancestors.push(fragments.slice(0, index).join("/"));
  }

  return ancestors;
}

function sortTreeNodes(nodes: WorkspaceTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      sortTreeNodes(node.children);
    }
  }
}

function buildGitTreeView(gitStatus: GitStatusResponse | null) {
  const nodes: WorkspaceTreeNode[] = [];
  const fileBadgeMap = new Map<string, string[]>();
  const folderBadgeMap = new Map<string, string[]>();
  const expandedIds: string[] = [];

  if (!gitStatus?.available || gitStatus.fileStatuses.length === 0) {
    return {
      expandedIds,
      fileBadgeMap,
      folderBadgeMap,
      nodes
    };
  }

  const nodeByPath = new Map<string, WorkspaceTreeNode>();
  const folderPaths = new Set<string>();
  const folderStats = new Map<string, { additions: number; deletions: number }>();
  const folderStatusBadges = new Map(
    gitStatus.folderStatuses.map((entry) => [entry.relativePath, entry.badges] as const)
  );

  for (const entry of gitStatus.fileStatuses) {
    const fragments = entry.relativePath.split("/").filter(Boolean);
    let children = nodes;
    let currentPath = "";

    fileBadgeMap.set(entry.relativePath, [...entry.badges, `+${entry.additions}`, `-${entry.deletions}`]);

    for (const ancestor of gitAncestorsForPath(entry.relativePath)) {
      folderPaths.add(ancestor);
      const currentStats = folderStats.get(ancestor) ?? {
        additions: 0,
        deletions: 0
      };

      folderStats.set(ancestor, {
        additions: currentStats.additions + entry.additions,
        deletions: currentStats.deletions + entry.deletions
      });
    }

    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const isLeaf = index === fragments.length - 1;
      currentPath = currentPath ? `${currentPath}/${fragment}` : fragment;

      let node = nodeByPath.get(currentPath);

      if (!node) {
        node = {
          children: isLeaf ? undefined : [],
          id: `git:${currentPath}`,
          kind: isLeaf ? "file" : "directory",
          name: fragment,
          relativePath: currentPath
        };
        nodeByPath.set(currentPath, node);
        children.push(node);
      }

      if (!isLeaf) {
        folderPaths.add(currentPath);
        children = node.children ?? [];
      }
    }
  }

  for (const folderPath of folderPaths) {
    const stats = folderStats.get(folderPath) ?? {
      additions: 0,
      deletions: 0
    };

    folderBadgeMap.set(folderPath, [
      ...(folderStatusBadges.get(folderPath) ?? []),
      `+${stats.additions}`,
      `-${stats.deletions}`
    ]);
    expandedIds.push(`git:${folderPath}`);
  }

  sortTreeNodes(nodes);

  return {
    expandedIds,
    fileBadgeMap,
    folderBadgeMap,
    nodes
  };
}

function getBrowserIdeUrl(project: ProjectRecord | null) {
  return project?.browserIdeUrl ?? import.meta.env.VITE_BROWSER_IDE_URL ?? null;
}

function useCompactLayout() {
  const [isCompactLayout, setIsCompactLayout] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia("(max-width: 960px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(max-width: 960px)");
    const handleChange = () => {
      setIsCompactLayout(query.matches);
    };

    handleChange();
    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  return isCompactLayout;
}

function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>;
}

function formatReasoningLabel(value: ReasoningEffortLevel) {
  switch (value) {
    case "xhigh":
      return "Extra high";
    case "none":
      return "None";
    default:
      return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }
}

function formatAccessLabel(value: RuntimeAccessMode) {
  switch (value) {
    case "danger-full-access":
      return "Full access";
    case "workspace-write":
      return "Workspace write";
    default:
      return "Read only";
  }
}

function formatDurationLabel(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
  }

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function ResizeHandle({ label }: { label: string }) {
  return (
    <PanelResizeHandle aria-label={label} className="resize-handle" role="separator">
      <span className="resize-handle__bar" />
    </PanelResizeHandle>
  );
}

function ThreadList({ activeThreadId, onSelect, threads }: ThreadListProps) {
  if (threads.length === 0) {
    return <p className="empty-copy">No threads are available yet.</p>;
  }

  return (
    <ul className="thread-list" aria-label="Threads">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            aria-label={thread.title}
            className={thread.id === activeThreadId ? "list-button list-button--active" : "list-button"}
            onClick={() => onSelect(thread.id)}
            type="button"
          >
            <span className="list-button__title">{thread.title}</span>
            <span className="list-button__meta">{thread.mode}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProjectPanel({
  addProjectExpanded,
  browserIdeUrl,
  browserIdeDraft,
  nameDraft,
  onAddProject,
  onBrowserIdeDraftChange,
  onNameDraftChange,
  onRootPathDraftChange,
  onSelectProject,
  onToggleAddProject,
  projects,
  rootPathDraft,
  selectedProject,
  selectedProjectId
}: ProjectPanelProps) {
  return (
    <div className="project-panel">
      <div className="panel__header panel__header--spacedless">
        <h2>Projects</h2>
        <button className="secondary-button" onClick={onToggleAddProject} type="button">
          {addProjectExpanded ? "Hide new project" : "Add project"}
        </button>
      </div>

      <label className="git-panel__field">
        <span className="git-panel__label">Current project</span>
        <select
          aria-label="Project selector"
          className="git-panel__input"
          onChange={(event) => onSelectProject(event.currentTarget.value)}
          value={selectedProjectId ?? ""}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      {selectedProject ? (
        <div className="project-panel__summary">
          <p className="session-summary__title">{selectedProject.name}</p>
          <p className="session-summary__meta">{selectedProject.rootPath}</p>
          {browserIdeUrl ? <p className="session-summary__meta">Browser IDE: {browserIdeUrl}</p> : null}
        </div>
      ) : null}

      {addProjectExpanded ? (
        <div className="git-panel__controls git-panel__controls--stack">
          <label className="git-panel__field">
            <span className="git-panel__label">Project name</span>
            <input
              aria-label="Project name"
              className="git-panel__input"
              onChange={(event) => onNameDraftChange(event.currentTarget.value)}
              value={nameDraft}
            />
          </label>
          <label className="git-panel__field">
            <span className="git-panel__label">Project root path</span>
            <input
              aria-label="Project root path"
              className="git-panel__input"
              onChange={(event) => onRootPathDraftChange(event.currentTarget.value)}
              value={rootPathDraft}
            />
          </label>
          <label className="git-panel__field">
            <span className="git-panel__label">Browser IDE URL</span>
            <input
              aria-label="Project browser ide url"
              className="git-panel__input"
              onChange={(event) => onBrowserIdeDraftChange(event.currentTarget.value)}
              value={browserIdeDraft}
            />
          </label>
          <button className="secondary-button" onClick={onAddProject} type="button">
            Save project
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConversationComposer({
  accessMode,
  canSend,
  error,
  modelId,
  models,
  onChange,
  onModelChange,
  onKeyDown,
  onReasoningChange,
  onSend,
  onAccessModeChange,
  reasoningEffort,
  runtimeUsage,
  value
}: {
  accessMode: RuntimeAccessMode;
  canSend: boolean;
  error: string | null;
  modelId: string;
  models: RuntimeInfoResponse["models"];
  onChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onReasoningChange: (value: ReasoningEffortLevel) => void;
  onSend: () => void;
  onAccessModeChange: (value: RuntimeAccessMode) => void;
  reasoningEffort: ReasoningEffortLevel;
  runtimeUsage: RuntimeInfoResponse["usage"];
  value: string;
}) {
  const selectedModel =
    models.find((option) => option.id === modelId) ?? models.find((option) => option.isDefault) ?? null;
  const supportedEfforts =
    selectedModel?.supportedReasoningEfforts.length
      ? selectedModel.supportedReasoningEfforts
      : (["low", "medium", "high", "xhigh"] as ReasoningEffortLevel[]);

  return (
    <div className="conversation-composer">
      <label className="git-panel__field">
        <span className="git-panel__label">Prompt</span>
        <textarea
          aria-label="Conversation prompt"
          className="git-panel__textarea conversation-composer__input"
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={
            canSend
              ? "Ask Codex to inspect, edit, or explain something in this project."
              : "Live send is unavailable while CodexRemote is using a mirrored or fallback adapter."
          }
          rows={4}
          value={value}
        />
      </label>
      <div className="conversation-composer__actions">
        <div className="conversation-composer__meta">
          {error ? (
            <p className="error-copy conversation-composer__error" role="alert">
              {error}
            </p>
          ) : null}
          {runtimeUsage ? (
            <p className="empty-copy conversation-composer__usage">
              {runtimeUsage.planType ? `${runtimeUsage.planType.toUpperCase()} · ` : ""}
              {runtimeUsage.primaryUsedPercent !== null ? `${runtimeUsage.primaryUsedPercent}% short window` : "No short-window data"}
              {runtimeUsage.secondaryUsedPercent !== null
                ? ` · ${runtimeUsage.secondaryUsedPercent}% weekly`
                : ""}
            </p>
          ) : null}
          {!canSend ? <p className="empty-copy">Switch to the live stdio adapter to send prompts.</p> : null}
          <div className="conversation-composer__selectors">
            <label className="composer-select composer-select--inline">
              <select
                aria-label="Model selector"
                className="git-panel__input conversation-composer__select"
                onChange={(event) => onModelChange(event.currentTarget.value)}
                value={modelId}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="composer-select composer-select--inline">
              <select
                aria-label="Reasoning selector"
                className="git-panel__input conversation-composer__select"
                onChange={(event) => onReasoningChange(event.currentTarget.value as ReasoningEffortLevel)}
                value={reasoningEffort}
              >
                {supportedEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {formatReasoningLabel(effort)}
                  </option>
                ))}
              </select>
            </label>
            <label className="composer-select composer-select--inline">
              <select
                aria-label="Access selector"
                className="git-panel__input conversation-composer__select"
                onChange={(event) => onAccessModeChange(event.currentTarget.value as RuntimeAccessMode)}
                value={accessMode}
              >
                <option value="read-only">Read only</option>
                <option value="workspace-write">Workspace write</option>
                <option value="danger-full-access">Full access</option>
              </select>
            </label>
          </div>
        </div>
        <button
          className="secondary-button conversation-composer__send"
          disabled={!canSend || value.trim().length === 0}
          onClick={onSend}
          type="button"
        >
          Send to Codex
        </button>
      </div>
    </div>
  );
}

function sliceThreadForTail(thread: ThreadResponse, messageLimit: number): ThreadResponse {
  return {
    ...thread,
    messages: thread.messages.slice(-messageLimit)
  };
}

interface ConversationEntry {
  activities: ThreadActivityEntry[];
  assistantMessages: ThreadMessage[];
  id: string;
  liveEvents: ThreadLiveEvent[];
  turnId: string | null;
  userMessages: ThreadMessage[];
}

function buildConversationEntries(
  thread: ThreadResponse | null,
  liveEvents: ThreadLiveEvent[]
): ConversationEntry[] {
  if (!thread) {
    return [];
  }

  const hasTurnMetadata =
    thread.messages.some((message) => Boolean(message.turnId)) ||
    thread.activities.some((activity) => Boolean(activity.turnId)) ||
    liveEvents.some((event) => Boolean(event.turnId));

  if (!hasTurnMetadata) {
    const entries: ConversationEntry[] = [];
    let currentEntry: ConversationEntry | null = null;

    for (const message of thread.messages) {
      if (!currentEntry || message.role === "user") {
        currentEntry = {
          activities: [],
          assistantMessages: [],
          id: message.id,
          liveEvents: [],
          turnId: null,
          userMessages: []
        };
        entries.push(currentEntry);
      }

      if (message.role === "user") {
        currentEntry.userMessages.push(message);
      } else {
        currentEntry.assistantMessages.push(message);
      }
    }

    const targetEntry = entries.at(-1);
    if (targetEntry) {
      targetEntry.activities.push(...thread.activities);
      targetEntry.liveEvents.push(...liveEvents);
    }

    return entries;
  }

  const order: string[] = [];
  const entries = new Map<string, ConversationEntry>();
  let fallbackIndex = 0;

  const ensureEntry = (turnId: string | null, preferredId?: string | null) => {
    const key = turnId ?? preferredId ?? `entry-${fallbackIndex += 1}`;

    if (!entries.has(key)) {
      entries.set(key, {
        activities: [],
        assistantMessages: [],
        id: key,
        liveEvents: [],
        turnId,
        userMessages: []
      });
      order.push(key);
    }

    return entries.get(key)!;
  };

  for (const message of thread.messages) {
    const entry = ensureEntry(message.turnId ?? null, message.id);
    if (message.role === "user") {
      entry.userMessages.push(message);
    } else {
      entry.assistantMessages.push(message);
    }
  }

  for (const activity of thread.activities) {
    const entry = ensureEntry(activity.turnId ?? null, activity.id);
    entry.activities.push(activity);
  }

  for (const liveEvent of liveEvents) {
    const entry = ensureEntry(liveEvent.turnId ?? null, liveEvent.groupId);
    entry.liveEvents.push(liveEvent);
  }

  return order.map((key) => entries.get(key)!);
}

function ConversationEntryCard({
  entry,
  expanded,
  index,
  onOpenActivityFile,
  onToggle
}: {
  entry: ConversationEntry;
  expanded: boolean;
  index: number;
  onOpenActivityFile: (relativePath: string, diff: string | null) => void;
  onToggle: () => void;
}) {
  const userPreview = entry.userMessages.map((message) => message.content).join("\n\n");
  const assistantPreview = entry.assistantMessages
    .map((message) => message.content)
    .join("\n\n");
  const showStreaming = entry.liveEvents.some((event) => event.status === "inProgress");

  return (
    <li className="message-card message-card--turn">
      <button className="message-card__button" onClick={onToggle} type="button">
        <div className="message-card__header">
          <div>
            <p className="message__role">Conversation</p>
            <p className="message-card__meta">
              Entry {index + 1}
              {userPreview ? ` • ${userPreview.length} prompt chars` : ""}
              {assistantPreview ? ` • ${assistantPreview.length} response chars` : ""}
            </p>
          </div>
          <span className="message-card__toggle">{expanded ? "Hide details" : "Show details"}</span>
        </div>
        <div className={expanded ? "message-card__body" : "message-card__body message-card__body--collapsed"}>
          {userPreview ? (
            <div className="message-card__section message-card__section--user">
              <p className="message__role">User</p>
              <ReactMarkdown>{userPreview}</ReactMarkdown>
            </div>
          ) : null}
          {assistantPreview ? (
            <div className="message-card__section message-card__section--assistant">
              <p className="message__role">Assistant</p>
              <ReactMarkdown>{assistantPreview}</ReactMarkdown>
            </div>
          ) : null}
          {expanded && entry.activities.length > 0 ? (
            <div className="message-card__activity">
              <p className="message__role">Work summary</p>
              <ol className="activity-list">
                {entry.activities.map((activity) => (
                  <li className={`activity-card activity-card--${activity.kind}`} key={activity.id}>
                    <div className="activity-card__header">
                      <p className="activity-card__title">{activity.title}</p>
                      <div className="activity-card__meta">
                        {activity.status ? <StatusPill label={activity.status} /> : null}
                        {activity.durationMs ? (
                          <StatusPill label={formatDurationLabel(activity.durationMs)} />
                        ) : null}
                      </div>
                    </div>
                    {activity.detail ? <p className="activity-card__detail">{activity.detail}</p> : null}
                    {activity.files.length > 0 ? (
                      <div className="activity-card__links">
                        {activity.files.map((file, fileIndex) => (
                          <button
                            className="secondary-button activity-card__link"
                            key={`${activity.id}:${file}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenActivityFile(
                                file,
                                activity.fileChanges[fileIndex]?.diff ?? null
                              );
                            }}
                            type="button"
                          >
                            {file}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {expanded && showStreaming ? (
            <div className="message-card__activity message-card__activity--streaming">
              <p className="message__role">Streaming now</p>
              <ol className="activity-list">
                {entry.liveEvents
                  .filter((event) => event.status === "inProgress")
                  .map((event) => (
                    <li className="activity-card activity-card--stream" key={event.id}>
                      <div className="activity-card__header">
                        <p className="activity-card__title">{event.title}</p>
                        <div className="activity-card__meta">
                          {event.status ? <StatusPill label={event.status} /> : null}
                        </div>
                      </div>
                      {event.detail ? <p className="activity-card__detail">{event.detail}</p> : null}
                      {event.files.length > 0 ? (
                        <div className="activity-card__links">
                          {event.files.map((file, fileIndex) => (
                            <button
                              className="secondary-button activity-card__link"
                              key={`${event.id}:${file}`}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                onOpenActivityFile(
                                  file,
                                  event.fileChanges[fileIndex]?.diff ?? null
                                );
                              }}
                              type="button"
                            >
                              {file}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {event.tokenUsageSummary ? (
                        <p className="activity-card__files">{event.tokenUsageSummary}</p>
                      ) : null}
                    </li>
                  ))}
              </ol>
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function ConversationTimeline({
  entries,
  expandedEntryIds,
  onOpenActivityFile,
  onToggleEntry
}: {
  entries: ConversationEntry[];
  expandedEntryIds: Set<string>;
  onOpenActivityFile: (relativePath: string, diff: string | null) => void;
  onToggleEntry: (entryId: string) => void;
}) {
  return (
    <ol className="message-list">
      {entries.map((entry, index) => (
        <ConversationEntryCard
          entry={entry}
          expanded={expandedEntryIds.has(entry.id)}
          index={index}
          key={entry.id}
          onOpenActivityFile={onOpenActivityFile}
          onToggle={() => onToggleEntry(entry.id)}
        />
      ))}
    </ol>
  );
}

function mergeLiveEvent(
  current: ThreadLiveEvent[],
  incoming: ThreadLiveEvent
): ThreadLiveEvent[] {
  const existingIndex = current.findIndex((event) => event.groupId === incoming.groupId);

  if (existingIndex === -1) {
    return [incoming, ...current].slice(0, 30);
  }

  const next = [...current];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    detail:
      incoming.kind.endsWith("_delta") && existing.detail && incoming.detail
        ? `${existing.detail}${incoming.detail}`
        : incoming.detail ?? existing.detail,
    fileChanges: incoming.fileChanges.length > 0 ? incoming.fileChanges : existing.fileChanges,
    files: incoming.files.length > 0 ? incoming.files : existing.files,
    status: incoming.status ?? existing.status,
    tokenUsageSummary: incoming.tokenUsageSummary ?? existing.tokenUsageSummary,
    title: incoming.title || existing.title
  };

  return next;
}

function removeLiveEventsForThreadTurn(
  current: ThreadLiveEvent[],
  liveEvent: ThreadLiveEvent
) {
  return current.filter((event) => {
    if (liveEvent.kind === "turn_completed") {
      return event.turnId !== liveEvent.turnId;
    }

    if (liveEvent.kind === "item_completed") {
      return event.groupId !== liveEvent.groupId;
    }

    return true;
  });
}

function AccessPanel({
  currentUser,
  onLogout,
  onToggleAdmin,
  onToggleAllowed,
  users
}: AccessPanelProps) {
  return (
    <div className="git-panel">
      <div className="panel__header panel__header--spaced">
        <h2>Access</h2>
        <button className="secondary-button" onClick={onLogout} type="button">
          Log out
        </button>
      </div>
      <div className="session-summary">
        <div className="session-summary__item">
          <p className="session-summary__title">{currentUser.name}</p>
          <p className="session-summary__meta">{currentUser.email}</p>
        </div>
      </div>
      {currentUser.isAdmin ? (
        <div className="git-panel__content">
          {users.map((user) => (
            <div className="git-panel__controls git-panel__controls--stack" key={user.id}>
              <div>
                <p className="session-summary__title">{user.email}</p>
                <p className="session-summary__meta">
                  {user.isAdmin ? "Admin" : "User"} • {user.isAllowed ? "Allowed" : "Blocked"}
                </p>
              </div>
              <div className="git-panel__controls">
                <button
                  className="secondary-button"
                  onClick={() => onToggleAllowed(user)}
                  type="button"
                >
                  {user.isAllowed ? "Revoke access" : "Allow user"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onToggleAdmin(user)}
                  type="button"
                >
                  {user.isAdmin ? "Remove admin" : "Make admin"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GitSidePanel({
  activeDiffPath,
  defaultExpandedIds,
  fileBadgeMap,
  folderBadgeMap,
  gitStatus,
  nodes,
  onOpenControls,
  onOpenDiff
}: GitSidePanelProps) {
  return (
    <section className="panel panel--git-sidebar">
      <div className="panel__header panel__header--conversation">
        <div>
          <h2>Git</h2>
          <p>Changed files and folders</p>
        </div>
        <button className="secondary-button" onClick={onOpenControls} type="button">
          Open controls
        </button>
      </div>

      {!gitStatus ? <p className="empty-copy">Loading Git status...</p> : null}

      {gitStatus && !gitStatus.available ? (
        <p className="empty-copy">This workspace is not inside a Git repository.</p>
      ) : null}

      {gitStatus && gitStatus.available ? (
        <div className="git-sidebar__stack">
          <div className="git-sidebar__summary">
            <StatusPill label={gitStatus.branch ?? "Detached HEAD"} tone="accent" />
            <StatusPill label={`${gitStatus.dirtyCount} touched`} />
            <StatusPill label={`Staged ${gitStatus.stagedCount}`} />
            <StatusPill label={`Unstaged ${gitStatus.unstagedCount}`} tone="warning" />
          </div>

          {nodes.length > 0 ? (
            <div className="tree-shell git-sidebar__tree-shell">
              <FileTree
                activeFilePath={activeDiffPath}
                ariaLabel="Git changed files"
                defaultExpandedIds={defaultExpandedIds}
                fileBadgeMap={fileBadgeMap}
                folderBadgeMap={folderBadgeMap}
                nodes={nodes}
                onSelectFile={onOpenDiff}
              />
            </div>
          ) : (
            <p className="empty-copy">Working tree is clean.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function GitControlsOverlay({
  commitMessage,
  gitStatus,
  onCheckout,
  onClose,
  onCommit,
  onCommitMessageChange,
  onCreateBranchDialogOpen,
  onPull,
  onPush,
  onRefresh,
  onSelectedBranchChange,
  onStageAll,
  selectedBranch,
  stagedFiles
}: GitControlsOverlayProps) {
  return (
    <div className="overlay-backdrop" role="presentation">
      <div aria-label="Git controls" aria-modal="true" className="overlay-panel git-overlay" role="dialog">
        <div className="panel__header panel__header--conversation">
          <div>
            <h2>Git controls</h2>
            <p>{gitStatus?.branch ?? "Detached HEAD"}</p>
          </div>
          <div className="git-overlay__header-actions">
            <button className="secondary-button" onClick={onRefresh} type="button">
              Refresh
            </button>
            <button className="secondary-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        {!gitStatus ? <p className="empty-copy">Loading Git status...</p> : null}

        {gitStatus && !gitStatus.available ? (
          <p className="empty-copy">This workspace is not inside a Git repository.</p>
        ) : null}

        {gitStatus && gitStatus.available ? (
          <div className="git-overlay__body">
            <section className="git-overlay__section">
              <div className="git-overlay__section-header">
                <h3>Sync</h3>
                <p>Push and pull against the current branch.</p>
              </div>
              <div className="git-overlay__actions">
                <button className="secondary-button" onClick={onPull} type="button">
                  Pull
                </button>
                <button className="secondary-button" onClick={onPush} type="button">
                  Push
                </button>
              </div>
            </section>

            <section className="git-overlay__section">
              <div className="git-overlay__section-header">
                <h3>Branches</h3>
                <p>Switch branches or create a new one.</p>
              </div>
              <label className="git-panel__field">
                <span className="git-panel__label">Branches</span>
                <select
                  aria-label="Branch selector"
                  className="git-panel__input"
                  onChange={(event) => onSelectedBranchChange(event.currentTarget.value)}
                  value={selectedBranch || gitStatus.branch || ""}
                >
                  {gitStatus.branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </label>
              <div className="git-overlay__actions">
                <button className="secondary-button" onClick={onCheckout} type="button">
                  Checkout branch
                </button>
                <button className="secondary-button" onClick={onCreateBranchDialogOpen} type="button">
                  New branch
                </button>
              </div>
            </section>

            <section className="git-overlay__section">
              <div className="git-overlay__section-header">
                <h3>Commit</h3>
                <p>Stage changes, review the staged set, and commit.</p>
              </div>
              <label className="git-panel__field">
                <span className="git-panel__label">Commit message</span>
                <textarea
                  aria-label="Commit message"
                  className="git-panel__textarea"
                  onChange={(event) => onCommitMessageChange(event.currentTarget.value)}
                  rows={4}
                  value={commitMessage}
                />
              </label>
              <div className="git-overlay__staged">
                <div className="git-overlay__staged-header">
                  <p className="git-overlay__staged-title">Staged for commit</p>
                  <StatusPill label={`${stagedFiles.length} files`} />
                </div>
                {stagedFiles.length > 0 ? (
                  <div className="git-overlay__staged-list" role="list" aria-label="Staged files">
                    {stagedFiles.map((entry) => (
                      <div className="git-overlay__staged-item" key={entry.relativePath} role="listitem">
                        <span className="git-overlay__staged-path">{entry.relativePath}</span>
                        <span className="git-sidebar__file-stat git-sidebar__file-stat--add">+{entry.additions}</span>
                        <span className="git-sidebar__file-stat git-sidebar__file-stat--delete">-{entry.deletions}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">No files are staged yet.</p>
                )}
              </div>
              <div className="git-overlay__actions">
                <button className="secondary-button" onClick={onStageAll} type="button">
                  Stage all
                </button>
                <button
                  className="secondary-button"
                  disabled={commitMessage.trim().length === 0 || stagedFiles.length === 0}
                  onClick={onCommit}
                  type="button"
                >
                  Commit staged
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BranchDialog({
  branchDraft,
  onBranchDraftChange,
  onClose,
  onCreateBranch
}: BranchDialogProps) {
  return (
    <div className="overlay-backdrop overlay-backdrop--nested" role="presentation">
      <div aria-label="Create branch" aria-modal="true" className="overlay-panel branch-dialog" role="dialog">
        <div className="panel__header panel__header--conversation">
          <div>
            <h2>Create branch</h2>
            <p>Choose a new branch name for this workspace.</p>
          </div>
        </div>
        <label className="git-panel__field">
          <span className="git-panel__label">Branch name</span>
          <input
            aria-label="New branch name"
            className="git-panel__input"
            onChange={(event) => onBranchDraftChange(event.currentTarget.value)}
            type="text"
            value={branchDraft}
          />
        </label>
        <div className="git-overlay__actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="secondary-button"
            disabled={branchDraft.trim().length === 0}
            onClick={onCreateBranch}
            type="button"
          >
            Create branch
          </button>
        </div>
      </div>
    </div>
  );
}

function ExplorerPane({
  activeFilePath,
  fileBadgeMap,
  folderBadgeMap,
  onSelectFile,
  onToggleCollapse,
  workspaceTree
}: {
  activeFilePath: string | null;
  fileBadgeMap: Map<string, string[]>;
  folderBadgeMap: Map<string, string[]>;
  onSelectFile: (relativePath: string) => void;
  onToggleCollapse: () => void;
  workspaceTree: WorkspaceTreeResponse | null;
}) {
  if (!workspaceTree) {
    return <p className="empty-copy">Workspace data is not loaded yet.</p>;
  }

  return (
    <div className="explorer-pane">
      <div className="explorer-pane__header">
        <p className="workspace-path">{workspaceTree.rootPath}</p>
          <button
            aria-label="Collapse explorer"
            className="icon-button"
            onClick={onToggleCollapse}
            type="button"
          >
            {"<"}
          </button>
      </div>
      <div className="tree-shell">
        <FileTree
          activeFilePath={activeFilePath}
          fileBadgeMap={fileBadgeMap}
          folderBadgeMap={folderBadgeMap}
          nodes={workspaceTree.nodes}
          onSelectFile={onSelectFile}
        />
      </div>
    </div>
  );
}

function MarkdownPreview({
  content,
  file
}: {
  content: string;
  file: WorkspaceFile;
}) {
  return (
    <div className="preview-pane">
      <div className="preview-pane__header">
        <p className="preview-pane__path">{file.relativePath}</p>
        <StatusPill label="Markdown preview" tone="accent" />
      </div>
      <article className="markdown-preview">
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  );
}

function TextPreview({
  content,
  file
}: {
  content: string;
  file: WorkspaceFile;
}) {
  return (
    <div className="preview-pane">
      <div className="preview-pane__header">
        <p className="preview-pane__path">{file.relativePath}</p>
        <StatusPill label="Text preview" tone="accent" />
      </div>
      <pre className="text-preview">{content}</pre>
    </div>
  );
}

function FilePane({
  diffView,
  editorContent,
  file,
  markdownViewMode,
  onChange,
  onSave,
  onShowPreview,
  onShowSource
}: FilePaneProps) {
  if (diffView) {
    const diffFile: WorkspaceFile = {
      content: diffView.diff,
      contentType: "text/plain",
      relativePath: `${diffView.relativePath}.diff`,
      size: diffView.diff.length
    };

    return (
      <div className="file-pane">
        <div className="file-pane__header">
          <div>
            <p className="preview-pane__path">{diffView.relativePath}</p>
            <p className="session-summary__meta">Read-only diff preview</p>
          </div>
        </div>
        <EditorPane file={diffFile} onChange={() => undefined} readOnly value={diffView.diff} />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="editor-empty">
        <p className="empty-copy">Select a text file from the explorer to edit it here.</p>
      </div>
    );
  }

  const isMarkdown = file.contentType === "text/markdown";

  return (
    <div className="file-pane">
      <div className="file-pane__header">
        <div>
          <p className="preview-pane__path">{file.relativePath}</p>
          <p className="session-summary__meta">
            {isMarkdown ? "Markdown document" : "Editable text file"}
          </p>
        </div>
        <div className="file-pane__actions">
          {isMarkdown && markdownViewMode === "preview" ? (
            <button className="secondary-button" onClick={onShowSource} type="button">
              Show source
            </button>
          ) : null}
          {isMarkdown && markdownViewMode === "source" ? (
            <button className="secondary-button" onClick={onShowPreview} type="button">
              Show preview
            </button>
          ) : null}
          <button className="secondary-button" onClick={onSave} type="button">
            Save file
          </button>
        </div>
      </div>
      {isMarkdown && markdownViewMode === "preview" ? (
        <MarkdownPreview content={editorContent} file={file} />
      ) : null}
      {isMarkdown && markdownViewMode === "source" ? (
        <EditorPane file={file} onChange={onChange} value={editorContent} />
      ) : null}
      {!isMarkdown && file.contentType === "text/plain" ? (
        <EditorPane file={file} onChange={onChange} value={editorContent} />
      ) : null}
      {!isMarkdown && file.contentType !== "text/plain" ? (
        <TextPreview content={editorContent} file={file} />
      ) : null}
    </div>
  );
}

async function loadProjectContext(projectId: string, messageLimit = DEFAULT_THREAD_MESSAGE_LIMIT) {
  const [gitStatus, sessionsResponse, workspaceTree] = await Promise.all([
    getGitStatus(projectId),
    getSessions(projectId),
    getWorkspaceTree(projectId)
  ]);

  const sessions = sessionsResponse.sessions;
  const activeSessionId = sessions[0]?.id ?? null;
  const threadsResponse = activeSessionId
    ? await getThreads(activeSessionId, projectId)
    : { activeThreadId: null, threads: [] };
  const threads = threadsResponse.threads;
  const activeThreadId = threadsResponse.activeThreadId ?? threads[0]?.id ?? null;
  const activeThread = activeThreadId ? await getThread(activeThreadId, messageLimit) : null;

  return {
    activeSessionId,
    activeThread,
    activeThreadId,
    gitStatus,
    sessions,
    threads,
    workspaceTree
  };
}

async function loadInitialState(): Promise<Pick<
  AppState,
  | "authenticatedUser"
  | "authConfigured"
  | "authEnabled"
  | "gitStatus"
  | "health"
  | "modes"
  | "projects"
  | "runtimeInfo"
  | "selectedProjectId"
  | "sessions"
  | "threads"
  | "activeSessionId"
  | "activeThreadId"
  | "activeThread"
  | "workspaceTree"
  | "users"
>> {
  const [authConfig, authMe, health] = await Promise.all([
    getAuthConfig(),
    getAuthMe(),
    getHealth()
  ]);

  if (authConfig.enabled && !authMe.authenticated) {
    return {
      authenticatedUser: null,
      authConfigured: authConfig.configured,
      authEnabled: authConfig.enabled,
      gitStatus: null,
      health,
      modes: null,
      projects: [],
      runtimeInfo: null,
      selectedProjectId: null,
      sessions: [],
      threads: [],
      activeSessionId: null,
      activeThreadId: null,
      activeThread: null,
      workspaceTree: null,
      users: []
    };
  }

  const [modes, projectsResponse, runtimeInfo] = await Promise.all([
    getModes(),
    getProjects(),
    getRuntimeInfo()
  ]);

  const users =
    authMe.user?.isAdmin && authMe.authenticated
      ? (await getAuthUsers()).users
      : [];

  const projects = projectsResponse.projects;
  const selectedProjectId = projectsResponse.defaultProjectId ?? projects[0]?.id ?? null;
  const projectContext = selectedProjectId
    ? await loadProjectContext(selectedProjectId)
    : {
        activeSessionId: null,
        activeThread: null,
        activeThreadId: null,
        gitStatus: null,
        sessions: [],
        threads: [],
        workspaceTree: null
      };

  return {
    authenticatedUser: authMe.user,
    authConfigured: authConfig.configured,
    authEnabled: authConfig.enabled,
    gitStatus: projectContext.gitStatus,
    health,
    modes,
    projects,
    runtimeInfo,
    selectedProjectId,
    sessions: projectContext.sessions,
    threads: projectContext.threads,
    activeSessionId: projectContext.activeSessionId,
    activeThreadId: projectContext.activeThreadId,
    activeThread: projectContext.activeThread,
    workspaceTree: projectContext.workspaceTree,
    users
  };
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [liveEvents, setLiveEvents] = useState<ThreadLiveEvent[]>([]);
  const [selectedAccessMode, setSelectedAccessMode] = useState<RuntimeAccessMode>("workspace-write");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<ReasoningEffortLevel>("medium");
  const [composeValue, setComposeValue] = useState("");
  const [browserIdeDraft, setBrowserIdeDraft] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set());
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("agent");
  const [gitControlsOpen, setGitControlsOpen] = useState(false);
  const [gitBranchDialogOpen, setGitBranchDialogOpen] = useState(false);
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>("preview");
  const [messageLimit, setMessageLimit] = useState(DEFAULT_THREAD_MESSAGE_LIMIT);
  const [nameDraft, setNameDraft] = useState("");
  const [projectComposerExpanded, setProjectComposerExpanded] = useState(false);
  const [rootPathDraft, setRootPathDraft] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const conversationBodyRef = useRef<HTMLDivElement | null>(null);
  const previewContent = useDeferredValue(state.editorContent);
  const isCompactLayout = useCompactLayout();
  const showWorkspaceNavigatorInSidebar = !isCompactLayout && focusMode === "workspace";
  const selectedProject =
    state.projects.find((project) => project.id === state.selectedProjectId) ?? null;
  const browserIdeUrl = getBrowserIdeUrl(selectedProject);
  const canSendMessages = state.modes?.capabilities.supportsSend ?? false;
  const availableModels = state.runtimeInfo?.models ?? [];
  const selectedModel =
    availableModels.find((model) => model.id === selectedModelId) ??
    availableModels.find((model) => model.isDefault) ??
    null;
  const conversationEntries = useMemo(
    () => buildConversationEntries(state.activeThread, liveEvents),
    [liveEvents, state.activeThread]
  );

  const fileBadgeMap = useMemo(
    () => new Map((state.gitStatus?.fileStatuses ?? []).map((entry) => [entry.relativePath, entry.badges])),
    [state.gitStatus]
  );
  const stagedFiles = useMemo(
    () => (state.gitStatus?.fileStatuses ?? []).filter((entry) => entry.staged),
    [state.gitStatus]
  );
  const folderBadgeMap = useMemo(
    () => new Map((state.gitStatus?.folderStatuses ?? []).map((entry) => [entry.relativePath, entry.badges])),
    [state.gitStatus]
  );
  const gitTreeView = useMemo(() => buildGitTreeView(state.gitStatus), [state.gitStatus]);

  useEffect(() => {
    if (state.gitStatus?.branch) {
      setSelectedBranch(state.gitStatus.branch);
    }
  }, [state.gitStatus?.branch]);

  useEffect(() => {
    if (!state.runtimeInfo) {
      return;
    }

    const runtimeInfo = state.runtimeInfo;

    if (!selectedModelId) {
      if (runtimeInfo.defaultModelId) {
        setSelectedModelId(runtimeInfo.defaultModelId);
      }
    } else if (!runtimeInfo.models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(runtimeInfo.defaultModelId ?? runtimeInfo.models[0]?.id ?? "");
    }

    setSelectedAccessMode((current) =>
      runtimeInfo.accessModes.includes(current)
        ? current
        : runtimeInfo.defaultAccessMode
    );
  }, [selectedModelId, state.runtimeInfo]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    const supported = selectedModel.supportedReasoningEfforts;

    if (!supported.includes(selectedReasoningEffort)) {
      setSelectedReasoningEffort(selectedModel.defaultReasoningEffort);
    }
  }, [selectedModel, selectedReasoningEffort]);

  async function refreshGitStatus(projectId = state.selectedProjectId) {
    if (!projectId) {
      return;
    }

    const gitStatus = await getGitStatus(projectId);

    startTransition(() => {
      setState((current) => ({
        ...current,
        gitStatus
      }));
    });
  }

  async function refreshWorkspaceTree(projectId = state.selectedProjectId) {
    if (!projectId) {
      return;
    }

    const workspaceTree = await getWorkspaceTree(projectId);

    startTransition(() => {
      setState((current) => ({
        ...current,
        workspaceTree
      }));
    });
  }

  async function refreshRuntimeInfo() {
    const runtimeInfo = await getRuntimeInfo();

    startTransition(() => {
      setState((current) => ({
        ...current,
        runtimeInfo
      }));
    });
  }

  async function handleSelectProject(projectId: string) {
    setState((current) => ({
      ...current,
      busyLabel: "Loading project..."
    }));

    try {
      const projectContext = await loadProjectContext(projectId, DEFAULT_THREAD_MESSAGE_LIMIT);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: null,
          activeFile: null,
          activeSessionId: projectContext.activeSessionId,
          activeThread: projectContext.activeThread,
          activeThreadId: projectContext.activeThreadId,
          editorContent: "",
          error: null,
          gitStatus: projectContext.gitStatus,
          selectedProjectId: projectId,
          sessions: projectContext.sessions,
          threads: projectContext.threads,
          workspaceTree: projectContext.workspaceTree,
          busyLabel: null
        }));
        setExpandedEntryIds(new Set());
        setMessageLimit(DEFAULT_THREAD_MESSAGE_LIMIT);
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to load the project."
      }));
    }
  }

  async function handleAddProject() {
    setState((current) => ({
      ...current,
      busyLabel: "Adding project..."
    }));

    try {
      const project = await createProject({
        browserIdeUrl: browserIdeDraft.trim() || null,
        name: nameDraft,
        rootPath: rootPathDraft
      });
      const projectsResponse = await getProjects();
      const projectContext = await loadProjectContext(project.id);

      setBrowserIdeDraft("");
      setNameDraft("");
      setRootPathDraft("");
      setProjectComposerExpanded(false);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: null,
          activeFile: null,
          activeSessionId: projectContext.activeSessionId,
          activeThread: projectContext.activeThread,
          activeThreadId: projectContext.activeThreadId,
          editorContent: "",
          error: null,
          gitStatus: projectContext.gitStatus,
          projects: projectsResponse.projects,
          selectedProjectId: project.id,
          sessions: projectContext.sessions,
          threads: projectContext.threads,
          workspaceTree: projectContext.workspaceTree,
          busyLabel: null
        }));
        setExpandedEntryIds(new Set());
        setMessageLimit(DEFAULT_THREAD_MESSAGE_LIMIT);
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to add the project."
      }));
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function bootstrap() {
      setState((current) => ({
        ...current,
        busyLabel: "Loading the local bridge baseline..."
      }));

      try {
        const nextState = await loadInitialState();

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setState((current) => ({
            ...current,
            ...nextState,
            busyLabel: null,
            error: null
          }));
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          busyLabel: null,
          error: error instanceof Error ? error.message : "Failed to load the shell."
        }));
      }
    }

    void bootstrap();

    return () => {
      isCancelled = true;
    };
  }, []);

  const selectedSession = useMemo(
    () => state.sessions.find((session) => session.id === state.activeSessionId) ?? null,
    [state.activeSessionId, state.sessions]
  );

  async function handleThreadSelect(threadId: string) {
    setState((current) => ({
      ...current,
      activeThreadId: threadId,
      busyLabel: "Loading thread..."
    }));

    try {
      const thread = await getThread(threadId, DEFAULT_THREAD_MESSAGE_LIMIT);
      const summary = state.threads.find((entry) => entry.id === threadId);

      if (state.selectedProjectId) {
        await setProjectThreadState(state.selectedProjectId, threadId, summary?.updatedAt ?? null);
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: null,
          activeThreadId: threadId,
          activeThread: thread,
          busyLabel: null,
          error: null
        }));
        setExpandedEntryIds(new Set());
        setMessageLimit(DEFAULT_THREAD_MESSAGE_LIMIT);
        setFocusMode("agent");
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to load the thread."
      }));
    }
  }

  async function handleSelectFile(relativePath: string) {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Loading file..."
    }));

    try {
      const file = await getWorkspaceFile(state.selectedProjectId, relativePath);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: null,
          activeFile: file,
          editorContent: file.content,
          busyLabel: null,
          error: null,
          saveState: "idle"
        }));
        setMarkdownViewMode(file.contentType === "text/markdown" ? "preview" : "source");
        setFocusMode("workspace");
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to load the file."
      }));
    }
  }

  async function handleSendMessage() {
    if (!state.selectedProjectId || composeValue.trim().length === 0) {
      return;
    }

    const outboundMessage = composeValue.trim();
    setComposeValue("");

    setState((current) => ({
      ...current,
      busyLabel: current.activeThreadId ? "Sending prompt to Codex..." : "Starting a live Codex thread..."
    }));

    try {
      const nextThread = await sendThreadMessage(
        state.selectedProjectId,
        outboundMessage,
        state.activeThreadId,
        {
          accessMode: selectedAccessMode,
          model: selectedModelId || null,
          reasoningEffort: selectedReasoningEffort
        }
      );
      const sessionsResponse = await getSessions(state.selectedProjectId);
      const nextSessionId = sessionsResponse.sessions[0]?.id ?? null;
      const threadsResponse =
        nextSessionId
          ? await getThreads(nextSessionId, state.selectedProjectId)
          : { activeThreadId: null, threads: [] };
      const nextThreadSummary =
        threadsResponse.threads.find((thread) => thread.id === nextThread.thread.id) ?? null;
      const runtimeInfo = await getRuntimeInfo();

      await setProjectThreadState(
        state.selectedProjectId,
        nextThread.thread.id,
        nextThreadSummary?.updatedAt ?? null
      );

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeSessionId: nextSessionId,
          activeThread: sliceThreadForTail(nextThread, messageLimit),
          activeThreadId: nextThread.thread.id,
          busyLabel: null,
          error: null,
          runtimeInfo,
          sessions: sessionsResponse.sessions,
          threads: threadsResponse.threads
        }));
        setExpandedEntryIds(new Set());
        setFocusMode("agent");
      });
    } catch (error) {
      setComposeValue(outboundMessage);
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to send the prompt to Codex."
      }));
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") {
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();

      const target = event.currentTarget;
      const selectionStart = target.selectionStart ?? target.value.length;
      const selectionEnd = target.selectionEnd ?? target.value.length;
      target.setRangeText("\n", selectionStart, selectionEnd, "end");
      setComposeValue(target.value);
      return;
    }

    if (event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  }

  async function handleSaveFile() {
    if (!state.activeFile || state.activeDiff || !state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Saving file...",
      saveState: "saving"
    }));

    try {
      await saveWorkspaceFile(
        state.selectedProjectId,
        state.activeFile.relativePath,
        state.editorContent
      );

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeFile: current.activeFile
            ? {
                ...current.activeFile,
                content: current.editorContent,
                size: current.editorContent.length
              }
            : null,
          busyLabel: null,
          error: null,
          saveState: "saved"
        }));
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to save the file.",
        saveState: "dirty"
      }));
    }
  }

  async function handleStageAll() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Staging all changes..."
    }));

    try {
      await stageAllGitChanges(state.selectedProjectId);
      await refreshGitStatus(state.selectedProjectId);
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to stage changes."
      }));
    }
  }

  async function handleCommit() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Creating commit..."
    }));

    try {
      await commitGitChanges(state.selectedProjectId, commitMessage);
      setCommitMessage("");
      await refreshGitStatus(state.selectedProjectId);
      setState((current) => ({
        ...current,
        activeDiff: null,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to create commit."
      }));
    }
  }

  async function handleCheckout() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Switching branch..."
    }));

    try {
      await checkoutGitBranch(state.selectedProjectId, selectedBranch);
      await Promise.all([
        refreshGitStatus(state.selectedProjectId),
        refreshWorkspaceTree(state.selectedProjectId)
      ]);
      setState((current) => ({
        ...current,
        activeDiff: null,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to switch branch."
      }));
    }
  }

  async function handleCreateBranch() {
    if (!state.selectedProjectId) {
      return;
    }

    const nextBranchName = branchDraft.trim();

    if (nextBranchName.length === 0) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Creating branch..."
    }));

    try {
      await createGitBranch(state.selectedProjectId, nextBranchName);
      setSelectedBranch(nextBranchName);
      setBranchDraft("");
      setGitBranchDialogOpen(false);
      await refreshGitStatus(state.selectedProjectId);
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to create branch."
      }));
    }
  }

  async function handlePull() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Pulling latest changes..."
    }));

    try {
      await pullGitChanges(state.selectedProjectId);
      await Promise.all([
        refreshGitStatus(state.selectedProjectId),
        refreshWorkspaceTree(state.selectedProjectId)
      ]);
      setState((current) => ({
        ...current,
        activeDiff: null,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to pull changes."
      }));
    }
  }

  async function handlePush() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Pushing branch..."
    }));

    try {
      await pushGitChanges(state.selectedProjectId);
      await refreshGitStatus(state.selectedProjectId);
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to push changes."
      }));
    }
  }

  async function handleOpenGitDiff(relativePath: string) {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: `Loading diff for ${relativePath}...`
    }));

    try {
      const diffView = await getGitDiff(state.selectedProjectId, relativePath);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: {
            diff: diffView.diff,
            relativePath: diffView.relativePath
          },
          activeFile: null,
          busyLabel: null,
          editorContent: diffView.diff,
          error: null
        }));
        setFocusMode("workspace");
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busyLabel: null,
        error: error instanceof Error ? error.message : "Failed to load the Git diff."
      }));
    }
  }

  function handleEditorChange(value: string) {
    setState((current) => ({
      ...current,
      editorContent: value,
      saveState: current.activeFile && value !== current.activeFile.content ? "dirty" : "idle"
    }));
  }

  function handleNewThread() {
    setComposeValue("");
    setExpandedEntryIds(new Set());
    setFocusMode("agent");
    setLiveEvents([]);
    setMessageLimit(DEFAULT_THREAD_MESSAGE_LIMIT);
    setState((current) => ({
      ...current,
      activeDiff: null,
      activeThread: null,
      activeThreadId: null,
      error: null
    }));
  }

  function handleToggleEntry(entryId: string) {
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }

      return next;
    });
  }

  async function handleOpenActivityFile(relativePath: string, diff: string | null) {
    if (diff) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          activeDiff: {
            diff,
            relativePath
          },
          activeFile: null,
          editorContent: diff,
          error: null
        }));
        setFocusMode("workspace");
      });
      return;
    }

    await handleSelectFile(relativePath);
  }

  async function handleLoadMoreHistory() {
    if (!state.activeThreadId) {
      return;
    }

    const nextLimit = messageLimit + THREAD_MESSAGE_LIMIT_STEP;
    const thread = await getThread(state.activeThreadId, nextLimit);

    startTransition(() => {
      setState((current) => ({
        ...current,
        activeThread: thread,
        error: null
      }));
      setMessageLimit(nextLimit);
    });
  }

  const refreshLiveBridgeState = useEffectEvent(async () => {
    if (!state.selectedProjectId) {
      return;
    }

    try {
      const requestedActiveThreadId = state.activeThreadId;
      const sessionsResponse = await getSessions(state.selectedProjectId);
      const nextSessionId = state.activeSessionId ?? sessionsResponse.sessions[0]?.id ?? null;
      const threadsResponse =
        nextSessionId
          ? await getThreads(nextSessionId, state.selectedProjectId)
          : { activeThreadId: null, threads: [] };
      const requestedThreadStillExists = requestedActiveThreadId
        ? threadsResponse.threads.some((thread) => thread.id === requestedActiveThreadId)
        : false;
      const sharedActiveThreadId = threadsResponse.activeThreadId ?? threadsResponse.threads[0]?.id ?? null;
      const nextActiveThreadId =
        requestedThreadStillExists && !sharedActiveThreadId
          ? requestedActiveThreadId
          : sharedActiveThreadId ??
            (requestedActiveThreadId
            ? threadsResponse.threads[0]?.id ?? null
            : null);
      const nextActiveThread =
        nextActiveThreadId && focusMode === "agent"
          ? await getThread(nextActiveThreadId, messageLimit)
          : null;

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeSessionId: nextSessionId,
          activeThread:
            nextActiveThread ??
            (nextActiveThreadId === current.activeThreadId ? current.activeThread : null),
          activeThreadId: nextActiveThreadId,
          error: null,
          sessions: sessionsResponse.sessions,
          threads: threadsResponse.threads
        }));
      });
    } catch {
      // Keep the current UI state if live polling fails; the next tick can recover.
    }
  });

  useEffect(() => {
    if (!state.selectedProjectId) {
      return;
    }

    void refreshLiveBridgeState();

    const interval = window.setInterval(() => {
      void refreshLiveBridgeState();
    }, LIVE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [focusMode, messageLimit, refreshLiveBridgeState, state.selectedProjectId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshRuntimeInfo();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setLiveEvents([]);

    if (
      typeof window === "undefined" ||
      typeof window.EventSource === "undefined" ||
      !state.activeThreadId ||
      focusMode !== "agent"
    ) {
      return;
    }

    const threadId = state.activeThreadId;
    const source = new EventSource(`/api/threads/${encodeURIComponent(threadId)}/events`);

    source.onmessage = (event) => {
      try {
        const liveEvent = JSON.parse(event.data) as ThreadLiveEvent;

        setLiveEvents((current) => mergeLiveEvent(current, liveEvent));

        if (liveEvent.kind === "turn_completed" || liveEvent.kind === "item_completed") {
          void getThread(threadId, messageLimit).then((thread) => {
            startTransition(() => {
              setState((current) =>
                current.activeThreadId === threadId
                  ? {
                      ...current,
                      activeThread: thread
                    }
                  : current
              );
            });
            setLiveEvents((current) => removeLiveEventsForThreadTurn(current, liveEvent));
          });
        }
      } catch {
        // Ignore malformed SSE events.
      }
    };

    return () => {
      source.close();
    };
  }, [focusMode, messageLimit, state.activeThreadId]);

  const defaultSidebarSurface = (
    <section className="panel panel--sidebar">
      <ProjectPanel
        addProjectExpanded={projectComposerExpanded}
        browserIdeUrl={browserIdeUrl}
        browserIdeDraft={browserIdeDraft}
        nameDraft={nameDraft}
        onAddProject={handleAddProject}
        onBrowserIdeDraftChange={setBrowserIdeDraft}
        onNameDraftChange={setNameDraft}
        onRootPathDraftChange={setRootPathDraft}
        onSelectProject={handleSelectProject}
        onToggleAddProject={() => setProjectComposerExpanded((current) => !current)}
        projects={state.projects}
        rootPathDraft={rootPathDraft}
        selectedProject={selectedProject}
        selectedProjectId={state.selectedProjectId}
      />
      <div className="panel__header panel__header--spaced">
        <h2>Sessions</h2>
        {selectedSession ? <p>{selectedSession.workspaceLabel ?? selectedSession.title}</p> : null}
      </div>
      {state.sessions.length > 1 ? (
        <div className="session-summary">
          {state.sessions.map((session) => (
            <div className="session-summary__item" key={session.id}>
              <p className="session-summary__title">{session.title}</p>
              <p className="session-summary__meta">{session.workspaceLabel ?? "No workspace label"}</p>
            </div>
          ))}
        </div>
      ) : selectedSession ? (
        <div className="session-summary session-summary--compact">
          <div className="session-summary__item">
            <p className="session-summary__title">{selectedSession.title}</p>
            <p className="session-summary__meta">
              {selectedSession.workspaceLabel ?? "No workspace label"}
            </p>
          </div>
        </div>
      ) : (
        <p className="empty-copy">No live sessions were found for this project yet.</p>
      )}
      <div className="panel__header panel__header--spaced">
        <h2>Threads</h2>
        <button className="secondary-button" onClick={handleNewThread} type="button">
          New thread
        </button>
      </div>
      <ThreadList
        activeThreadId={state.activeThreadId}
        onSelect={handleThreadSelect}
        threads={state.threads}
      />
      {state.authenticatedUser ? (
        <AccessPanel
          currentUser={state.authenticatedUser}
          onLogout={async () => {
            await logoutAuthSession();
            window.location.reload();
          }}
          onToggleAdmin={async (user) => {
            const updated = await updateAuthUser(user.id, {
              isAdmin: !user.isAdmin
            });
            setState((current) => ({
              ...current,
              users: current.users.map((entry) => (entry.id === updated.id ? updated : entry))
            }));
          }}
          onToggleAllowed={async (user) => {
            const updated = await updateAuthUser(user.id, {
              isAllowed: !user.isAllowed
            });
            setState((current) => ({
              ...current,
              users: current.users.map((entry) => (entry.id === updated.id ? updated : entry))
            }));
          }}
          users={state.users}
        />
      ) : null}
    </section>
  );

  const workspaceSidebarSurface = (
    <section className="panel panel--sidebar panel--sidebar-workspace">
      {explorerCollapsed ? (
        <div className="collapsed-rail collapsed-rail--sidebar">
          <button
            aria-label="Expand explorer"
            className="icon-button"
            onClick={() => setExplorerCollapsed(false)}
            type="button"
          >
            {">"}
          </button>
        </div>
      ) : (
        <ExplorerPane
          activeFilePath={state.activeFile?.relativePath ?? null}
          fileBadgeMap={fileBadgeMap}
          folderBadgeMap={folderBadgeMap}
          onSelectFile={handleSelectFile}
          onToggleCollapse={() => setExplorerCollapsed(true)}
          workspaceTree={state.workspaceTree}
        />
      )}
    </section>
  );

  const sidebarSurface = showWorkspaceNavigatorInSidebar ? workspaceSidebarSurface : defaultSidebarSurface;
  const gitSidebarSurface = (
    <GitSidePanel
      activeDiffPath={state.activeDiff?.relativePath ?? null}
      defaultExpandedIds={gitTreeView.expandedIds}
      fileBadgeMap={gitTreeView.fileBadgeMap}
      folderBadgeMap={gitTreeView.folderBadgeMap}
      gitStatus={state.gitStatus}
      nodes={gitTreeView.nodes}
      onOpenControls={() => {
        setGitBranchDialogOpen(false);
        setGitControlsOpen(true);
      }}
      onOpenDiff={handleOpenGitDiff}
    />
  );

  const conversationPanel = (
    <section className="panel panel--conversation">
      <div className="sr-only">
        <h2>{state.activeThread?.thread.title ?? "New conversation"}</h2>
      </div>
      <div
        className="conversation-panel__body"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (
            element.scrollTop <= 32 &&
            state.activeThread &&
            state.activeThread.messages.length < state.activeThread.messageCount
          ) {
            void handleLoadMoreHistory();
          }
        }}
        ref={conversationBodyRef}
      >
        {state.activeThread ? (
          <>
            {state.activeThread.messages.length < state.activeThread.messageCount ? (
              <div className="conversation-history__loadmore">
                <button className="secondary-button" onClick={handleLoadMoreHistory} type="button">
                  Load older entries
                </button>
                <p className="empty-copy">
                  Showing {state.activeThread.messages.length} of {state.activeThread.messageCount} entries
                </p>
              </div>
            ) : null}
            <ConversationTimeline
              entries={conversationEntries}
              expandedEntryIds={expandedEntryIds}
              onOpenActivityFile={handleOpenActivityFile}
              onToggleEntry={handleToggleEntry}
            />
          </>
        ) : (
          <div className="conversation-empty">
            <p className="empty-copy">
              Start a new project-scoped thread here. CodexRemote will create it under the selected workspace.
            </p>
          </div>
        )}
      </div>
      <ConversationComposer
        accessMode={selectedAccessMode}
        canSend={canSendMessages}
        error={state.error}
        modelId={selectedModelId}
        models={availableModels}
        onChange={setComposeValue}
        onModelChange={(nextModelId) => {
          setSelectedModelId(nextModelId);
          const nextModel = availableModels.find((model) => model.id === nextModelId);
          if (nextModel) {
            setSelectedReasoningEffort(nextModel.defaultReasoningEffort);
          }
        }}
        onKeyDown={handleComposerKeyDown}
        onReasoningChange={setSelectedReasoningEffort}
        onSend={handleSendMessage}
        onAccessModeChange={setSelectedAccessMode}
        reasoningEffort={selectedReasoningEffort}
        runtimeUsage={state.runtimeInfo?.usage ?? null}
        value={composeValue}
      />
    </section>
  );

  const workspacePanel = (
    <section className="panel panel--workspace">
      <div className="panel__header">
        <h2>Workspace</h2>
        <p>{selectedProject?.name ?? "No project selected"}</p>
      </div>
      <div className="workspace-panel__body">
        <div
          className={
            showWorkspaceNavigatorInSidebar
              ? "workspace-top-shell workspace-top-shell--single"
              : "workspace-top-shell"
          }
        >
          {showWorkspaceNavigatorInSidebar ? (
            <div className="workspace-main">
              <FilePane
                diffView={state.activeDiff}
                editorContent={previewContent}
                file={state.activeFile}
                markdownViewMode={markdownViewMode}
                onChange={handleEditorChange}
                onSave={handleSaveFile}
                onShowPreview={() => setMarkdownViewMode("preview")}
                onShowSource={() => setMarkdownViewMode("source")}
              />
            </div>
          ) : (
            <>
              {explorerCollapsed ? (
                <div className="collapsed-rail">
                  <button
                    aria-label="Expand explorer"
                    className="icon-button"
                    onClick={() => setExplorerCollapsed(false)}
                    type="button"
                  >
                    {">"}
                  </button>
                </div>
              ) : null}
              <PanelGroup className="workspace-layout" direction="horizontal">
                {!explorerCollapsed ? (
                  <>
                    <Panel defaultSize={28} minSize={16}>
                      <ExplorerPane
                        activeFilePath={state.activeFile?.relativePath ?? null}
                        fileBadgeMap={fileBadgeMap}
                        folderBadgeMap={folderBadgeMap}
                        onSelectFile={handleSelectFile}
                        onToggleCollapse={() => setExplorerCollapsed(true)}
                        workspaceTree={state.workspaceTree}
                      />
                    </Panel>
                    <ResizeHandle label="Resize explorer and editor" />
                  </>
                ) : null}
                <Panel defaultSize={explorerCollapsed ? 100 : 72} minSize={30}>
                  <FilePane
                    diffView={state.activeDiff}
                    editorContent={previewContent}
                    file={state.activeFile}
                    markdownViewMode={markdownViewMode}
                    onChange={handleEditorChange}
                    onSave={handleSaveFile}
                    onShowPreview={() => setMarkdownViewMode("preview")}
                    onShowSource={() => setMarkdownViewMode("source")}
                  />
                </Panel>
              </PanelGroup>
            </>
          )}
        </div>
        <div className="workspace-terminal-shell">
          {terminalCollapsed ? (
            <div className="collapsed-rail collapsed-rail--terminal">
              <button
                aria-label="Expand terminal"
                className="icon-button"
                onClick={() => setTerminalCollapsed(false)}
                type="button"
              >
                {"^"}
              </button>
            </div>
          ) : (
            <TerminalPane
              cwdLabel={state.workspaceTree?.rootPath ?? "Workspace root"}
              onToggleCollapse={() => setTerminalCollapsed(true)}
              projectId={state.selectedProjectId ?? ""}
            />
          )}
        </div>
      </div>
    </section>
  );

  const mainModeToggle = (
    <div className="zen-toggle zen-toggle--desktop" role="tablist" aria-label="Main mode">
      <button
        aria-selected={focusMode === "agent"}
        className={focusMode === "agent" ? "zen-toggle__button zen-toggle__button--active" : "zen-toggle__button"}
        onClick={() => setFocusMode("agent")}
        role="tab"
        type="button"
      >
        Conversation view
      </button>
      <button
        aria-selected={focusMode === "workspace"}
        className={
          focusMode === "workspace" ? "zen-toggle__button zen-toggle__button--active" : "zen-toggle__button"
        }
        onClick={() => setFocusMode("workspace")}
        role="tab"
        type="button"
      >
        Workspace view
      </button>
    </div>
  );

  const desktopSurface = (
    <PanelGroup autoSaveId="desktop-shell-layout" className="desktop-shell" direction="horizontal">
      <Panel defaultSize={22} id="desktop-left-sidebar" minSize={16} order={1}>
        {sidebarSurface}
      </Panel>
      <ResizeHandle label="Resize left sidebar and main panel" />
      <Panel defaultSize={56} id="desktop-main-panel" minSize={32} order={2}>
        <div className="desktop-main-shell">
          <div className="desktop-main">
            {focusMode === "agent" ? conversationPanel : null}
            {focusMode === "workspace" ? workspacePanel : null}
          </div>
        </div>
      </Panel>
      <ResizeHandle label="Resize main panel and right sidebar" />
      <Panel defaultSize={22} id="desktop-right-sidebar" minSize={16} order={3}>
        {gitSidebarSurface}
      </Panel>
    </PanelGroup>
  );

  const compactAgentSurface = (
    <>
      {sidebarSurface}
      {conversationPanel}
      {gitSidebarSurface}
    </>
  );

  const compactWorkspaceSurface = (
    <>
      {workspacePanel}
      {gitSidebarSurface}
    </>
  );

  if (state.authEnabled && !state.authenticatedUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand-lockup">
            <img alt="CodexRemote logo" className="app-logo" src={codexRemoteLogoUrl} />
            <div className="sr-only">
              <p>Local Codex workspace companion</p>
              <h1>CodexRemote</h1>
            </div>
          </div>
        </header>
        <main className="app-main">
          <section className="panel login-panel">
            <div className="panel__header">
              <h2>Sign in required</h2>
              <p>Protected CodexRemote host</p>
            </div>
            <p className="empty-copy">
              Sign in with your allowed Google account to access projects, terminals, and Git workflows on this host.
            </p>
            <a className="header-link login-panel__link" href="/api/auth/google/start">
              Sign in with Google
            </a>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img alt="CodexRemote logo" className="app-logo" src={codexRemoteLogoUrl} />
          <div className="sr-only">
            <p>Local Codex workspace companion</p>
            <h1>CodexRemote</h1>
          </div>
        </div>
        <div className="status-row">
          {!isCompactLayout ? mainModeToggle : null}
          {browserIdeUrl ? (
            <a className="header-link" href={browserIdeUrl} rel="noreferrer" target="_blank">
              Launch VS Code
            </a>
          ) : null}
        </div>
      </header>

        {isCompactLayout ? (
        <div className="zen-toggle" role="tablist" aria-label="Zen mode">
          <button
            aria-selected={focusMode === "agent"}
            className={focusMode === "agent" ? "zen-toggle__button zen-toggle__button--active" : "zen-toggle__button"}
            onClick={() => setFocusMode("agent")}
            role="tab"
            type="button"
          >
            Conversation view
          </button>
          <button
            aria-selected={focusMode === "workspace"}
            className={
              focusMode === "workspace" ? "zen-toggle__button zen-toggle__button--active" : "zen-toggle__button"
            }
            onClick={() => setFocusMode("workspace")}
            role="tab"
            type="button"
          >
            Workspace view
          </button>
        </div>
      ) : null}

      <main className="app-main">
        {!isCompactLayout ? desktopSurface : null}
        {isCompactLayout && focusMode === "agent" ? compactAgentSurface : null}
        {isCompactLayout && focusMode === "workspace" ? compactWorkspaceSurface : null}
      </main>

      {gitControlsOpen ? (
        <GitControlsOverlay
          commitMessage={commitMessage}
          gitStatus={state.gitStatus}
          onCheckout={handleCheckout}
          onClose={() => {
            setGitBranchDialogOpen(false);
            setGitControlsOpen(false);
          }}
          onCommit={handleCommit}
          onCommitMessageChange={setCommitMessage}
          onCreateBranchDialogOpen={() => setGitBranchDialogOpen(true)}
          onPull={handlePull}
          onPush={handlePush}
          onRefresh={() => refreshGitStatus()}
          onSelectedBranchChange={setSelectedBranch}
          onStageAll={handleStageAll}
          selectedBranch={selectedBranch}
          stagedFiles={stagedFiles}
        />
      ) : null}

      {gitControlsOpen && gitBranchDialogOpen ? (
        <BranchDialog
          branchDraft={branchDraft}
          onBranchDraftChange={setBranchDraft}
          onClose={() => {
            setBranchDraft("");
            setGitBranchDialogOpen(false);
          }}
          onCreateBranch={handleCreateBranch}
        />
      ) : null}

      {state.busyLabel || state.error ? (
        <footer className="app-footer">
          {state.busyLabel ? <p role="status">{state.busyLabel}</p> : null}
          {state.error ? <p className="error-copy">{state.error}</p> : null}
        </footer>
      ) : null}
    </div>
  );
}
