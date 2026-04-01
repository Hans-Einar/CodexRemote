import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle
} from "react-resizable-panels";
import codexRemoteLogoUrl from "../../logo.png";

import {
  checkoutGitBranch,
  commitGitChanges,
  createGitBranch,
  createProject,
  getGitStatus,
  getHealth,
  getModes,
  getProjects,
  getSessions,
  getThread,
  getThreads,
  getWorkspaceFile,
  getWorkspaceTree,
  saveWorkspaceFile,
  stageAllGitChanges
} from "./api";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { TerminalPane } from "./TerminalPane";
import type {
  GitStatusResponse,
  HealthResponse,
  ModesResponse,
  ProjectRecord,
  ThreadResponse,
  ThreadSummary,
  WorkspaceFile,
  WorkspaceTreeResponse
} from "../shared/contracts";

type FocusMode = "agent" | "workspace";
type MarkdownViewMode = "preview" | "source";

interface AppState {
  gitStatus: GitStatusResponse | null;
  health: HealthResponse | null;
  modes: ModesResponse | null;
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  sessions: Array<{ id: string; title: string; workspaceLabel?: string }>;
  threads: ThreadSummary[];
  activeSessionId: string | null;
  activeThreadId: string | null;
  activeThread: ThreadResponse | null;
  workspaceTree: WorkspaceTreeResponse | null;
  activeFile: WorkspaceFile | null;
  editorContent: string;
  saveState: "idle" | "dirty" | "saved" | "saving";
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
  editorContent: string;
  file: WorkspaceFile | null;
  markdownViewMode: MarkdownViewMode;
  onChange: (value: string) => void;
  onSave: () => void;
  onShowPreview: () => void;
  onShowSource: () => void;
}

interface GitPanelProps {
  branchDraft: string;
  commitMessage: string;
  gitStatus: GitStatusResponse | null;
  onBranchDraftChange: (value: string) => void;
  onCheckout: () => void;
  onCommitMessageChange: (value: string) => void;
  onCommit: () => void;
  onCreateBranch: () => void;
  onRefresh: () => void;
  onSelectedBranchChange: (value: string) => void;
  onStageAll: () => void;
  selectedBranch: string;
}

interface ProjectPanelProps {
  browserIdeDraft: string;
  nameDraft: string;
  onAddProject: () => void;
  onBrowserIdeDraftChange: (value: string) => void;
  onNameDraftChange: (value: string) => void;
  onRootPathDraftChange: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  projects: ProjectRecord[];
  rootPathDraft: string;
  selectedProjectId: string | null;
}

const initialState: AppState = {
  gitStatus: null,
  health: null,
  modes: null,
  projects: [],
  selectedProjectId: null,
  sessions: [],
  threads: [],
  activeSessionId: null,
  activeThreadId: null,
  activeThread: null,
  workspaceTree: null,
  activeFile: null,
  editorContent: "",
  saveState: "idle",
  error: null,
  busyLabel: null
};

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
  browserIdeDraft,
  nameDraft,
  onAddProject,
  onBrowserIdeDraftChange,
  onNameDraftChange,
  onRootPathDraftChange,
  onSelectProject,
  projects,
  rootPathDraft,
  selectedProjectId
}: ProjectPanelProps) {
  return (
    <div className="project-panel">
      <div className="panel__header">
        <h2>Projects</h2>
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
          Add project
        </button>
      </div>
    </div>
  );
}

function GitPanel({
  branchDraft,
  commitMessage,
  gitStatus,
  onBranchDraftChange,
  onCheckout,
  onCommitMessageChange,
  onCommit,
  onCreateBranch,
  onRefresh,
  onSelectedBranchChange,
  onStageAll,
  selectedBranch
}: GitPanelProps) {
  return (
    <div className="git-panel">
      <div className="panel__header panel__header--spaced">
        <h2>Git</h2>
        <button className="secondary-button" onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>

      {!gitStatus ? <p className="empty-copy">Loading Git status...</p> : null}

      {gitStatus && !gitStatus.available ? (
        <p className="empty-copy">This workspace is not inside a Git repository.</p>
      ) : null}

      {gitStatus && gitStatus.available ? (
        <div className="git-panel__content">
          <div className="git-panel__summary">
            <StatusPill label={gitStatus.branch ?? "Detached HEAD"} tone="accent" />
            <StatusPill label={`Staged ${gitStatus.stagedCount}`} />
            <StatusPill label={`Changed ${gitStatus.unstagedCount}`} tone="warning" />
          </div>

          <div className="git-panel__controls">
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
            <button className="secondary-button" onClick={onCheckout} type="button">
              Checkout branch
            </button>
          </div>

          <div className="git-panel__controls">
            <label className="git-panel__field">
              <span className="git-panel__label">New branch</span>
              <input
                aria-label="New branch name"
                className="git-panel__input"
                onChange={(event) => onBranchDraftChange(event.currentTarget.value)}
                type="text"
                value={branchDraft}
              />
            </label>
            <button className="secondary-button" onClick={onCreateBranch} type="button">
              Create branch
            </button>
          </div>

          <div className="git-panel__controls git-panel__controls--stack">
            <button className="secondary-button" onClick={onStageAll} type="button">
              Stage all
            </button>
            <label className="git-panel__field">
              <span className="git-panel__label">Commit</span>
              <textarea
                aria-label="Commit message"
                className="git-panel__textarea"
                onChange={(event) => onCommitMessageChange(event.currentTarget.value)}
                rows={3}
                value={commitMessage}
              />
            </label>
            <button className="secondary-button" onClick={onCommit} type="button">
              Commit staged
            </button>
          </div>
        </div>
      ) : null}
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
  editorContent,
  file,
  markdownViewMode,
  onChange,
  onSave,
  onShowPreview,
  onShowSource
}: FilePaneProps) {
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

async function loadProjectContext(projectId: string) {
  const [gitStatus, workspaceTree] = await Promise.all([
    getGitStatus(projectId),
    getWorkspaceTree(projectId)
  ]);

  return {
    gitStatus,
    workspaceTree
  };
}

async function loadInitialState(): Promise<Pick<
  AppState,
  | "gitStatus"
  | "health"
  | "modes"
  | "projects"
  | "selectedProjectId"
  | "sessions"
  | "threads"
  | "activeSessionId"
  | "activeThreadId"
  | "activeThread"
  | "workspaceTree"
>> {
  const [health, modes, projectsResponse, sessionsResponse] = await Promise.all([
    getHealth(),
    getModes(),
    getProjects(),
    getSessions()
  ]);

  const sessions = sessionsResponse.sessions;
  const projects = projectsResponse.projects;
  const selectedProjectId = projectsResponse.defaultProjectId ?? projects[0]?.id ?? null;
  const activeSessionId = sessions[0]?.id ?? null;
  const threads = activeSessionId ? (await getThreads(activeSessionId)).threads : [];
  const activeThreadId = threads[0]?.id ?? null;
  const activeThread = activeThreadId ? await getThread(activeThreadId) : null;
  const projectContext = selectedProjectId
    ? await loadProjectContext(selectedProjectId)
    : {
        gitStatus: null,
        workspaceTree: null
      };

  return {
    gitStatus: projectContext.gitStatus,
    health,
    modes,
    projects,
    selectedProjectId,
    sessions,
    threads,
    activeSessionId,
    activeThreadId,
    activeThread,
    workspaceTree: projectContext.workspaceTree
  };
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [browserIdeDraft, setBrowserIdeDraft] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("agent");
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>("preview");
  const [nameDraft, setNameDraft] = useState("");
  const [rootPathDraft, setRootPathDraft] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const previewContent = useDeferredValue(state.editorContent);
  const isCompactLayout = useCompactLayout();
  const selectedProject =
    state.projects.find((project) => project.id === state.selectedProjectId) ?? null;
  const browserIdeUrl = getBrowserIdeUrl(selectedProject);

  const fileBadgeMap = useMemo(
    () => new Map((state.gitStatus?.fileStatuses ?? []).map((entry) => [entry.relativePath, entry.badges])),
    [state.gitStatus]
  );
  const folderBadgeMap = useMemo(
    () => new Map((state.gitStatus?.folderStatuses ?? []).map((entry) => [entry.relativePath, entry.badges])),
    [state.gitStatus]
  );

  useEffect(() => {
    if (state.gitStatus?.branch) {
      setSelectedBranch(state.gitStatus.branch);
    }
  }, [state.gitStatus?.branch]);

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

  async function handleSelectProject(projectId: string) {
    setState((current) => ({
      ...current,
      busyLabel: "Loading project..."
    }));

    try {
      const { gitStatus, workspaceTree } = await loadProjectContext(projectId);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeFile: null,
          editorContent: "",
          error: null,
          gitStatus,
          selectedProjectId: projectId,
          workspaceTree,
          busyLabel: null
        }));
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
      const { gitStatus, workspaceTree } = await loadProjectContext(project.id);

      setBrowserIdeDraft("");
      setNameDraft("");
      setRootPathDraft("");

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeFile: null,
          editorContent: "",
          error: null,
          gitStatus,
          projects: projectsResponse.projects,
          selectedProjectId: project.id,
          workspaceTree,
          busyLabel: null
        }));
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
      busyLabel: "Loading thread..."
    }));

    try {
      const thread = await getThread(threadId);

      startTransition(() => {
        setState((current) => ({
          ...current,
          activeThreadId: threadId,
          activeThread: thread,
          busyLabel: null,
          error: null
        }));
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

  async function handleSaveFile() {
    if (!state.activeFile || !state.selectedProjectId) {
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
        error: error instanceof Error ? error.message : "Failed to switch branch."
      }));
    }
  }

  async function handleCreateBranch() {
    if (!state.selectedProjectId) {
      return;
    }

    setState((current) => ({
      ...current,
      busyLabel: "Creating branch..."
    }));

    try {
      await createGitBranch(state.selectedProjectId, branchDraft);
      setBranchDraft("");
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

  function handleEditorChange(value: string) {
    setState((current) => ({
      ...current,
      editorContent: value,
      saveState: current.activeFile && value !== current.activeFile.content ? "dirty" : "idle"
    }));
  }

  const sidebarSurface = (
    <section className="panel panel--sidebar">
      <ProjectPanel
        browserIdeDraft={browserIdeDraft}
        nameDraft={nameDraft}
        onAddProject={handleAddProject}
        onBrowserIdeDraftChange={setBrowserIdeDraft}
        onNameDraftChange={setNameDraft}
        onRootPathDraftChange={setRootPathDraft}
        onSelectProject={handleSelectProject}
        projects={state.projects}
        rootPathDraft={rootPathDraft}
        selectedProjectId={state.selectedProjectId}
      />
      <div className="panel__header panel__header--spaced">
        <h2>Sessions</h2>
        {selectedSession ? <p>{selectedSession.workspaceLabel ?? selectedSession.title}</p> : null}
      </div>
      <div className="session-summary">
        {state.sessions.map((session) => (
          <div className="session-summary__item" key={session.id}>
            <p className="session-summary__title">{session.title}</p>
            <p className="session-summary__meta">{session.workspaceLabel ?? "No workspace label"}</p>
          </div>
        ))}
      </div>
      <div className="panel__header panel__header--spaced">
        <h2>Threads</h2>
      </div>
      <ThreadList
        activeThreadId={state.activeThreadId}
        onSelect={handleThreadSelect}
        threads={state.threads}
      />
      <GitPanel
        branchDraft={branchDraft}
        commitMessage={commitMessage}
        gitStatus={state.gitStatus}
        onBranchDraftChange={setBranchDraft}
        onCheckout={handleCheckout}
        onCommit={handleCommit}
        onCommitMessageChange={setCommitMessage}
        onCreateBranch={handleCreateBranch}
        onRefresh={() => refreshGitStatus()}
        onSelectedBranchChange={setSelectedBranch}
        onStageAll={handleStageAll}
        selectedBranch={selectedBranch}
      />
    </section>
  );

  const conversationPanel = (
    <section className="panel">
      <div className="panel__header">
        <h2>{state.activeThread?.thread.title ?? "Conversation"}</h2>
        <p>{state.activeThread?.thread.mode ?? "No thread selected"}</p>
      </div>
      {state.activeThread ? (
        <ol className="message-list">
          {state.activeThread.messages.map((message) => (
            <li className={`message message--${message.role}`} key={message.id}>
              <p className="message__role">{message.role}</p>
              <p className="message__content">{message.content}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-copy">Choose a thread to inspect its conversation.</p>
      )}
    </section>
  );

  const workspacePanel = (
    <section className="panel panel--workspace">
      <div className="panel__header">
        <h2>Workspace</h2>
        <p>{selectedProject?.name ?? "No project selected"}</p>
      </div>
      <div className="workspace-panel__body">
        <div className="workspace-top-shell">
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

  const desktopSurface = (
    <div className="desktop-shell">
      {sidebarSurface}
      <PanelGroup className="desktop-main" direction="vertical">
        <Panel defaultSize={36} minSize={18}>
          {conversationPanel}
        </Panel>
        <ResizeHandle label="Resize conversation and workspace" />
        <Panel defaultSize={64} minSize={28}>
          {workspacePanel}
        </Panel>
      </PanelGroup>
    </div>
  );

  const compactAgentSurface = (
    <>
      {sidebarSurface}
      {conversationPanel}
    </>
  );

  const compactWorkspaceSurface = workspacePanel;

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
          {browserIdeUrl ? (
            <a className="header-link" href={browserIdeUrl} rel="noreferrer" target="_blank">
              Launch VS Code
            </a>
          ) : null}
          {state.health ? <StatusPill label={state.health.adapterLabel} tone="accent" /> : null}
          {state.modes ? <StatusPill label={`${state.modes.mode} mode`} /> : null}
          {state.health ? <StatusPill label={`Vite ${state.health.ports.vite}`} /> : null}
          {state.health ? <StatusPill label={`API ${state.health.ports.api}`} /> : null}
          {state.gitStatus?.branch ? <StatusPill label={state.gitStatus.branch} tone="accent" /> : null}
          {state.saveState === "dirty" ? <StatusPill label="Unsaved changes" tone="warning" /> : null}
          {state.saveState === "saved" ? <StatusPill label="File saved" tone="accent" /> : null}
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
            Agent view
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

      {state.busyLabel || state.error ? (
        <footer className="app-footer">
          {state.busyLabel ? <p role="status">{state.busyLabel}</p> : null}
          {state.error ? <p className="error-copy">{state.error}</p> : null}
        </footer>
      ) : null}
    </div>
  );
}
