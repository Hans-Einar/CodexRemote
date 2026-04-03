import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  ProjectRecord,
  ProjectThreadState,
  ProjectsResponse,
  ThreadSummary
} from "../shared/contracts";

interface ProjectRegistryOptions {
  dbPath: string;
  seedProject?: {
    browserIdeUrl?: string | null;
    name: string;
    rootPath: string;
  };
}

function nowIso() {
  return new Date().toISOString();
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project '${projectId}' was not found.`);
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectRootInvalidError extends Error {
  constructor(rootPath: string) {
    super(`Project root '${rootPath}' does not exist or is not a directory.`);
    this.name = "ProjectRootInvalidError";
  }
}

function assertDirectory(rootPath: string) {
  const stats = statSync(rootPath, {
    throwIfNoEntry: false
  });

  if (!stats?.isDirectory()) {
    throw new ProjectRootInvalidError(rootPath);
  }
}

function normalizeProjectRecord(row: Record<string, unknown>): ProjectRecord {
  return {
    browserIdeUrl: typeof row.browser_ide_url === "string" ? row.browser_ide_url : null,
    createdAt: String(row.created_at),
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    updatedAt: String(row.updated_at)
  };
}

export class ProjectRegistry {
  private readonly database: DatabaseSync;

  constructor(options: ProjectRegistryOptions) {
    mkdirSync(path.dirname(options.dbPath), {
      recursive: true
    });

    this.database = new DatabaseSync(options.dbPath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        browser_ide_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS project_thread_state (
        project_id TEXT PRIMARY KEY,
        active_thread_id TEXT,
        active_thread_updated_at TEXT,
        selection_source TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    if (options.seedProject) {
      this.ensureProject(options.seedProject);
    }
  }

  private ensureProject(project: { browserIdeUrl?: string | null; name: string; rootPath: string }) {
    assertDirectory(project.rootPath);

    const existing = this.database
      .prepare("SELECT * FROM projects WHERE root_path = ?")
      .get(project.rootPath) as Record<string, unknown> | undefined;

    if (existing) {
      return normalizeProjectRecord(existing);
    }

    const timestamp = nowIso();
    const id = randomUUID();

    this.database
      .prepare(
        `
          INSERT INTO projects (id, name, root_path, browser_ide_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(id, project.name, project.rootPath, project.browserIdeUrl ?? null, timestamp, timestamp);

    const inserted = this.database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as Record<string, unknown>;

    return normalizeProjectRecord(inserted);
  }

  listProjects(): ProjectsResponse {
    const rows = this.database
      .prepare("SELECT * FROM projects ORDER BY created_at ASC, name ASC")
      .all() as Record<string, unknown>[];

    const projects = rows.map(normalizeProjectRecord);

    return {
      defaultProjectId: projects[0]?.id ?? null,
      projects
    };
  }

  createProject(project: { browserIdeUrl?: string | null; name: string; rootPath: string }) {
    return this.ensureProject({
      browserIdeUrl: project.browserIdeUrl ?? null,
      name: project.name.trim(),
      rootPath: path.resolve(project.rootPath)
    });
  }

  getProjectThreadState(projectId: string): ProjectThreadState {
    this.getProject(projectId);

    const row = this.database
      .prepare(
        `
          SELECT active_thread_id, active_thread_updated_at, selection_source, updated_at
          FROM project_thread_state
          WHERE project_id = ?
        `
      )
      .get(projectId) as Record<string, unknown> | undefined;

    if (!row) {
      return {
        activeThreadId: null,
        activeThreadUpdatedAt:
          null,
        selectionSource: "none",
        updatedAt: null
      };
    }

    return {
      activeThreadId: typeof row.active_thread_id === "string" ? row.active_thread_id : null,
      activeThreadUpdatedAt:
        typeof row.active_thread_updated_at === "string" ? row.active_thread_updated_at : null,
      selectionSource: String(row.selection_source),
      updatedAt: String(row.updated_at)
    };
  }

  setProjectThreadState(
    projectId: string,
    state: {
      activeThreadId: string | null;
      activeThreadUpdatedAt?: string | null;
      selectionSource: string;
    }
  ): ProjectThreadState {
    this.getProject(projectId);
    const timestamp = nowIso();

    this.database
      .prepare(
        `
          INSERT INTO project_thread_state (
            project_id,
            active_thread_id,
            active_thread_updated_at,
            selection_source,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            active_thread_id = excluded.active_thread_id,
            active_thread_updated_at = excluded.active_thread_updated_at,
            selection_source = excluded.selection_source,
            updated_at = excluded.updated_at
        `
      )
      .run(
        projectId,
        state.activeThreadId,
        state.activeThreadUpdatedAt ?? null,
        state.selectionSource,
        timestamp
      );

    return this.getProjectThreadState(projectId);
  }

  reconcileProjectThreadState(projectId: string, threads: ThreadSummary[]) {
    const current = this.getProjectThreadState(projectId);
    const latestThread = threads[0];

    if (!latestThread) {
      return current;
    }

    const latestThreadUpdatedAt = latestThread.updatedAt ?? null;
    const currentThreadStillExists = current.activeThreadId
      ? threads.some((thread) => thread.id === current.activeThreadId)
      : false;

    if (!current.activeThreadId || !currentThreadStillExists) {
      return this.setProjectThreadState(projectId, {
        activeThreadId: latestThread.id,
        activeThreadUpdatedAt: latestThreadUpdatedAt,
        selectionSource: "project_latest"
      });
    }

    if (current.activeThreadId === latestThread.id) {
      if (current.activeThreadUpdatedAt !== latestThreadUpdatedAt) {
        return this.setProjectThreadState(projectId, {
          activeThreadId: latestThread.id,
          activeThreadUpdatedAt: latestThreadUpdatedAt,
          selectionSource: current.selectionSource
        });
      }

      return current;
    }

    const latestTimestamp = latestThreadUpdatedAt ? Date.parse(latestThreadUpdatedAt) : Number.NaN;
    const activeTimestamp = current.activeThreadUpdatedAt
      ? Date.parse(current.activeThreadUpdatedAt)
      : Number.NaN;

    if (!Number.isNaN(latestTimestamp) && (Number.isNaN(activeTimestamp) || latestTimestamp > activeTimestamp)) {
      return this.setProjectThreadState(projectId, {
        activeThreadId: latestThread.id,
        activeThreadUpdatedAt: latestThreadUpdatedAt,
        selectionSource: "project_latest"
      });
    }

    return current;
  }

  getProject(projectId: string) {
    const row = this.database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new ProjectNotFoundError(projectId);
    }

    return normalizeProjectRecord(row);
  }

  resolveProject(projectId?: string) {
    if (projectId) {
      return this.getProject(projectId);
    }

    const defaultProjectId = this.listProjects().defaultProjectId;

    if (!defaultProjectId) {
      throw new ProjectNotFoundError("default");
    }

    return this.getProject(defaultProjectId);
  }

  close() {
    this.database.close();
  }
}
