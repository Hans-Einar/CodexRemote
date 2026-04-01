import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { ProjectRecord, ProjectsResponse } from "../shared/contracts";

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
