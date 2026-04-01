import path from "node:path";
import { promises as fs } from "node:fs";

import type {
  WorkspaceFile,
  WorkspaceSaveResponse,
  WorkspaceTreeNode,
  WorkspaceTreeResponse
} from "../shared/contracts";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const IGNORED_DIRECTORY_NAMES = new Set([".git", "dist", "node_modules"]);

export class WorkspacePathError extends Error {
  constructor(
    readonly code: "WORKSPACE_PATH_OUTSIDE_ROOT" | "WORKSPACE_PATH_NOT_FILE" | "WORKSPACE_FILE_UNSUPPORTED",
    message: string
  ) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

function normalizeRelativePath(relativePath: string) {
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}

function resolveInsideRoot(rootPath: string, requestedPath = ".") {
  const absolutePath = path.resolve(rootPath, requestedPath);
  const relativePath = path.relative(rootPath, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new WorkspacePathError(
      "WORKSPACE_PATH_OUTSIDE_ROOT",
      "The requested path is outside the workspace root."
    );
  }

  return {
    absolutePath,
    relativePath: normalizeRelativePath(relativePath)
  };
}

function contentTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".md") {
    return "text/markdown";
  }

  return "text/plain";
}

async function buildTreeNodes(rootPath: string, relativePath = "."): Promise<WorkspaceTreeNode[]> {
  const resolved = resolveInsideRoot(rootPath, relativePath);
  const entries = await fs.readdir(resolved.absolutePath, {
    withFileTypes: true
  });

  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => !(entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  const nodes: WorkspaceTreeNode[] = [];

  for (const entry of visibleEntries) {
    const childRelativePath = normalizeRelativePath(
      path.join(resolved.relativePath === "." ? "" : resolved.relativePath, entry.name)
    );

    if (entry.isDirectory()) {
      nodes.push({
        children: await buildTreeNodes(rootPath, childRelativePath),
        id: childRelativePath,
        kind: "directory",
        name: entry.name,
        relativePath: childRelativePath
      });
      continue;
    }

    nodes.push({
      id: childRelativePath,
      kind: "file",
      name: entry.name,
      relativePath: childRelativePath
    });
  }

  return nodes;
}

export class WorkspaceService {
  constructor(private readonly rootPath: string) {}

  async getTree(): Promise<WorkspaceTreeResponse> {
    return {
      rootPath: this.rootPath,
      nodes: await buildTreeNodes(this.rootPath)
    };
  }

  async readFile(relativePath: string): Promise<WorkspaceFile> {
    const resolved = resolveInsideRoot(this.rootPath, relativePath);
    const stats = await fs.stat(resolved.absolutePath);

    if (!stats.isFile()) {
      throw new WorkspacePathError(
        "WORKSPACE_PATH_NOT_FILE",
        "The requested workspace path is not a file."
      );
    }

    const extension = path.extname(resolved.absolutePath).toLowerCase();

    if (!TEXT_EXTENSIONS.has(extension)) {
      throw new WorkspacePathError(
        "WORKSPACE_FILE_UNSUPPORTED",
        "The requested file type is not supported for preview yet."
      );
    }

    const content = await fs.readFile(resolved.absolutePath, "utf8");

    return {
      relativePath: resolved.relativePath,
      contentType: contentTypeForPath(resolved.absolutePath),
      content,
      size: stats.size
    };
  }

  async writeFile(relativePath: string, content: string): Promise<WorkspaceSaveResponse> {
    const resolved = resolveInsideRoot(this.rootPath, relativePath);
    const stats = await fs.stat(resolved.absolutePath);

    if (!stats.isFile()) {
      throw new WorkspacePathError(
        "WORKSPACE_PATH_NOT_FILE",
        "The requested workspace path is not a file."
      );
    }

    const extension = path.extname(resolved.absolutePath).toLowerCase();

    if (!TEXT_EXTENSIONS.has(extension)) {
      throw new WorkspacePathError(
        "WORKSPACE_FILE_UNSUPPORTED",
        "The requested file type is not supported for editing yet."
      );
    }

    await fs.writeFile(resolved.absolutePath, content, "utf8");

    return {
      relativePath: resolved.relativePath,
      saved: true
    };
  }
}
