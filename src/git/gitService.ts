import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type {
  GitDiffResponse,
  GitCheckoutResponse,
  GitCommitResponse,
  GitCreateBranchResponse,
  GitPullResponse,
  GitPushResponse,
  GitStageAllResponse,
  GitStatusEntry,
  GitStatusResponse
} from "../shared/contracts";

const execFile = promisify(execFileCallback);

type GitBadge = "A" | "D" | "M" | "R" | "U" | "?";

function badgePriority(badge: string) {
  const order = ["U", "M", "A", "R", "D", "?"];
  const index = order.indexOf(badge);
  return index === -1 ? order.length : index;
}

function sortBadges(badges: string[]) {
  return [...badges].sort((left, right) => badgePriority(left) - badgePriority(right));
}

function normalizeGitPath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function ancestorsForPath(relativePath: string) {
  const fragments = relativePath.split("/").filter(Boolean);
  const ancestors: string[] = [];

  for (let index = 1; index < fragments.length; index += 1) {
    ancestors.push(fragments.slice(0, index).join("/"));
  }

  return ancestors;
}

function badgeFromStatusCharacter(value: string): GitBadge | null {
  switch (value) {
    case "A":
      return "A";
    case "D":
      return "D";
    case "M":
      return "M";
    case "R":
      return "R";
    case "U":
      return "U";
    default:
      return null;
  }
}

function parseBranchName(statusLine: string) {
  const branchLine = statusLine.replace(/^## /, "");

  if (branchLine === "HEAD (no branch)") {
    return "HEAD";
  }

  const [branchName] = branchLine.split("...");
  return branchName.trim();
}

async function runGit(args: string[], cwd: string) {
  return execFile("git", args, {
    cwd
  });
}

async function runGitAllowFailure(args: string[], cwd: string) {
  try {
    return await runGit(args, cwd);
  } catch (error) {
    const details = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
    };

    if (details.code === 1) {
      return {
        stderr: details.stderr ?? "",
        stdout: details.stdout ?? ""
      };
    }

    throw error;
  }
}

function normalizeNumstatPath(rawPath: string) {
  let normalized = rawPath.trim();

  if (normalized.includes("{") && normalized.includes("}") && normalized.includes(" => ")) {
    normalized = normalized.replace(/\{([^{}]+?) => ([^{}]+?)\}/g, "$2");
  } else if (normalized.includes(" => ")) {
    normalized = normalized.split(" => ").at(-1) ?? normalized;
  }

  return normalizeGitPath(normalized);
}

function mergeDiffStats(output: string, statsByPath: Map<string, { additions: number; deletions: number }>) {
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [rawAdditions, rawDeletions, ...pathParts] = line.split("\t");
    const relativePath = normalizeNumstatPath(pathParts.join("\t"));

    if (!relativePath) {
      continue;
    }

    const additions = rawAdditions === "-" ? 0 : Number(rawAdditions);
    const deletions = rawDeletions === "-" ? 0 : Number(rawDeletions);
    const current = statsByPath.get(relativePath) ?? {
      additions: 0,
      deletions: 0
    };

    statsByPath.set(relativePath, {
      additions: current.additions + (Number.isFinite(additions) ? additions : 0),
      deletions: current.deletions + (Number.isFinite(deletions) ? deletions : 0)
    });
  }
}

function normalizeRelativeGitPath(relativePath: string) {
  const normalized = path.posix
    .normalize(normalizeGitPath(relativePath).replace(/^\.\//, ""))
    .replace(/^\/+/, "");

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new GitPathError();
  }

  return normalized;
}

function splitTextLines(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");

  if (normalized.length === 0) {
    return {
      endsWithNewline: false,
      lines: [] as string[]
    };
  }

  if (normalized.endsWith("\n")) {
    return {
      endsWithNewline: true,
      lines: normalized.slice(0, -1).split("\n")
    };
  }

  return {
    endsWithNewline: false,
    lines: normalized.split("\n")
  };
}

function buildUntrackedDiff(relativePath: string, content: Buffer) {
  const header = [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${relativePath}`
  ];

  if (content.includes(0)) {
    return [...header, `Binary files /dev/null and b/${relativePath} differ`].join("\n");
  }

  const text = content.toString("utf8");
  const { endsWithNewline, lines } = splitTextLines(text);

  if (lines.length === 0) {
    return header.join("\n");
  }

  const diffLines = [
    ...header,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ];

  if (!endsWithNewline) {
    diffLines.push("\\ No newline at end of file");
  }

  return diffLines.join("\n");
}

export class GitRepoRequiredError extends Error {
  constructor() {
    super("This workspace is not inside a Git repository.");
    this.name = "GitRepoRequiredError";
  }
}

export class GitPathError extends Error {
  constructor() {
    super("A valid repository-relative path is required.");
    this.name = "GitPathError";
  }
}

export class GitService {
  constructor(private readonly workspaceRoot: string) {}

  async isGitRepo() {
    try {
      await runGit(["rev-parse", "--show-toplevel"], this.workspaceRoot);
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatusResponse> {
    const available = await this.isGitRepo();

    if (!available) {
      return {
        available: false,
        branch: null,
        branches: [],
        dirtyCount: 0,
        fileStatuses: [],
        folderStatuses: [],
        stagedCount: 0,
        unstagedCount: 0
      };
    }

    const [{ stdout: branchOutput }, { stdout: statusOutput }, { stdout: stagedStats }, { stdout: unstagedStats }] =
      await Promise.all([
      runGit(["branch", "--format=%(refname:short)"], this.workspaceRoot),
      runGit(["status", "--porcelain=v1", "--branch", "--untracked-files=all"], this.workspaceRoot),
      runGitAllowFailure(["diff", "--cached", "--numstat", "--find-renames", "--"], this.workspaceRoot),
      runGitAllowFailure(["diff", "--numstat", "--find-renames", "--"], this.workspaceRoot)
      ]);

    const statusLines = statusOutput.split(/\r?\n/).filter(Boolean);
    const branchLine = statusLines[0] ?? "## HEAD";
    const branch = parseBranchName(branchLine);
    const fileStatuses: GitStatusEntry[] = [];
    const folderCounters = new Map<string, Map<string, number>>();
    const statsByPath = new Map<string, { additions: number; deletions: number }>();
    let stagedCount = 0;
    let unstagedCount = 0;

    mergeDiffStats(stagedStats, statsByPath);
    mergeDiffStats(unstagedStats, statsByPath);

    for (const line of statusLines.slice(1)) {
      if (line.startsWith("?? ")) {
        const relativePath = normalizeGitPath(line.slice(3).trim());
        const content = await fs.readFile(path.join(this.workspaceRoot, relativePath));
        const additions = content.includes(0) ? 0 : splitTextLines(content.toString("utf8")).lines.length;
        fileStatuses.push({
          additions,
          badges: ["?"],
          deletions: 0,
          relativePath,
          staged: false,
          unstaged: true
        });

        for (const ancestor of ancestorsForPath(relativePath)) {
          const entry = folderCounters.get(ancestor) ?? new Map<string, number>();
          entry.set("?", (entry.get("?") ?? 0) + 1);
          folderCounters.set(ancestor, entry);
        }

        unstagedCount += 1;
        continue;
      }

      const indexStatus = line[0];
      const workingTreeStatus = line[1];
      const pathValue = line.slice(3).trim();
      const relativePath = normalizeGitPath(
        pathValue.includes(" -> ") ? pathValue.split(" -> ").at(-1) ?? pathValue : pathValue
      );
      const badgeSet = new Set<string>();

      const indexBadge = badgeFromStatusCharacter(indexStatus);
      const workingTreeBadge = badgeFromStatusCharacter(workingTreeStatus);

      if (indexBadge) {
        badgeSet.add(indexBadge);
        stagedCount += 1;
      }

      if (workingTreeBadge) {
        badgeSet.add(workingTreeBadge);
        unstagedCount += 1;
      }

      const badges = sortBadges(Array.from(badgeSet));
      const stats = statsByPath.get(relativePath) ?? {
        additions: 0,
        deletions: 0
      };
      fileStatuses.push({
        additions: stats.additions,
        badges,
        deletions: stats.deletions,
        relativePath,
        staged: Boolean(indexBadge),
        unstaged: Boolean(workingTreeBadge)
      });

      for (const ancestor of ancestorsForPath(relativePath)) {
        const entry = folderCounters.get(ancestor) ?? new Map<string, number>();
        for (const badge of badges) {
          entry.set(badge, (entry.get(badge) ?? 0) + 1);
        }
        folderCounters.set(ancestor, entry);
      }
    }

    const folderStatuses: GitStatusEntry[] = Array.from(folderCounters.entries()).map(
      ([relativePath, counters]) => ({
        additions: 0,
        badges: sortBadges(
          Array.from(counters.entries()).map(([badge, count]) => `${badge}${count}`)
        ),
        deletions: 0,
        relativePath,
        staged: false,
        unstaged: false
      })
    );

    const branches = branchOutput
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));

    return {
      available: true,
      branch,
      branches,
      dirtyCount: fileStatuses.length,
      fileStatuses: fileStatuses.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      folderStatuses: folderStatuses.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      stagedCount,
      unstagedCount
    };
  }

  private async ensureRepo() {
    if (!(await this.isGitRepo())) {
      throw new GitRepoRequiredError();
    }
  }

  async stageAll(): Promise<GitStageAllResponse> {
    await this.ensureRepo();
    await runGit(["add", "-A"], this.workspaceRoot);
    return {
      staged: true
    };
  }

  async commit(message: string): Promise<GitCommitResponse> {
    await this.ensureRepo();
    await runGit(["commit", "-m", message], this.workspaceRoot);
    return {
      committed: true
    };
  }

  async createBranch(name: string): Promise<GitCreateBranchResponse> {
    await this.ensureRepo();
    await runGit(["branch", name], this.workspaceRoot);
    return {
      branch: name,
      created: true
    };
  }

  async checkout(branch: string): Promise<GitCheckoutResponse> {
    await this.ensureRepo();
    await runGit(["checkout", branch], this.workspaceRoot);
    return {
      branch
    };
  }

  async getDiff(relativePath: string): Promise<GitDiffResponse> {
    await this.ensureRepo();

    const normalizedPath = normalizeRelativeGitPath(relativePath);
    const { stdout: untrackedOutput } = await runGit(
      ["ls-files", "--others", "--exclude-standard", "--", normalizedPath],
      this.workspaceRoot
    );

    if (untrackedOutput.split(/\r?\n/).some((entry) => normalizeGitPath(entry.trim()) === normalizedPath)) {
      const content = await fs.readFile(path.join(this.workspaceRoot, normalizedPath));
      return {
        diff: buildUntrackedDiff(normalizedPath, content),
        relativePath: normalizedPath
      };
    }

    let diffOutput = "";

    try {
      const { stdout } = await runGit(
        ["diff", "HEAD", "--find-renames", "--", normalizedPath],
        this.workspaceRoot
      );
      diffOutput = stdout;
    } catch {
      const [{ stdout: stagedDiff }, { stdout: unstagedDiff }] = await Promise.all([
        runGitAllowFailure(["diff", "--cached", "--find-renames", "--", normalizedPath], this.workspaceRoot),
        runGitAllowFailure(["diff", "--find-renames", "--", normalizedPath], this.workspaceRoot)
      ]);

      diffOutput = [stagedDiff.trim(), unstagedDiff.trim()].filter(Boolean).join("\n\n");
    }

    return {
      diff: diffOutput || `No diff available for ${normalizedPath}.`,
      relativePath: normalizedPath
    };
  }

  async pull(): Promise<GitPullResponse> {
    await this.ensureRepo();
    await runGit(["pull", "--ff-only"], this.workspaceRoot);
    return {
      pulled: true
    };
  }

  async push(): Promise<GitPushResponse> {
    await this.ensureRepo();
    await runGit(["push"], this.workspaceRoot);
    return {
      pushed: true
    };
  }
}
