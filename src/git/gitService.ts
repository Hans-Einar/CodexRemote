import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import type {
  GitCheckoutResponse,
  GitCommitResponse,
  GitCreateBranchResponse,
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

export class GitRepoRequiredError extends Error {
  constructor() {
    super("This workspace is not inside a Git repository.");
    this.name = "GitRepoRequiredError";
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

    const [{ stdout: branchOutput }, { stdout: statusOutput }] = await Promise.all([
      runGit(["branch", "--format=%(refname:short)"], this.workspaceRoot),
      runGit(["status", "--porcelain=v1", "--branch", "--untracked-files=all"], this.workspaceRoot)
    ]);

    const statusLines = statusOutput.split(/\r?\n/).filter(Boolean);
    const branchLine = statusLines[0] ?? "## HEAD";
    const branch = parseBranchName(branchLine);
    const fileStatuses: GitStatusEntry[] = [];
    const folderCounters = new Map<string, Map<string, number>>();
    let stagedCount = 0;
    let unstagedCount = 0;

    for (const line of statusLines.slice(1)) {
      if (line.startsWith("?? ")) {
        const relativePath = normalizeGitPath(line.slice(3).trim());
        fileStatuses.push({
          badges: ["?"],
          relativePath
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
      fileStatuses.push({
        badges,
        relativePath
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
        badges: sortBadges(
          Array.from(counters.entries()).map(([badge, count]) => `${badge}${count}`)
        ),
        relativePath
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
}
