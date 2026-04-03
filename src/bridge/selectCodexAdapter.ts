import { existsSync } from "node:fs";
import path from "node:path";

import type { CodexAdapter } from "../shared/contracts";
import { createFixtureCodexAdapter } from "./fixtureCodexAdapter";
import { createLocalCodexStateAdapter, LocalCodexStateAdapter } from "./localCodexStateAdapter";
import { createStdioCodexAppServerAdapter } from "./stdioCodexAppServerAdapter";

export function selectCodexAdapter(options?: { codexBin?: string; codexHome?: string }): CodexAdapter {
  const codexHome =
    options?.codexHome ??
    process.env.CODEXREMOTE_CODEX_HOME ??
    path.join(process.env.USERPROFILE ?? "", ".codex");
  const codexBin =
    options?.codexBin ??
    process.env.CODEXREMOTE_CODEX_BIN ??
    path.join(
      process.env.USERPROFILE ?? "",
      ".vscode",
      "extensions",
      "openai.chatgpt-26.325.31654-win32-x64",
      "bin",
      "windows-x86_64",
      "codex.exe"
    );

  if (codexBin && existsSync(codexBin)) {
    try {
      return createStdioCodexAppServerAdapter({
        cwd: process.cwd()
      });
    } catch {
      // Fall through to local state and then fixture if stdio app-server setup fails.
    }
  }

  if (codexHome && LocalCodexStateAdapter.isAvailable(codexHome)) {
    return createLocalCodexStateAdapter({
      codexHome
    });
  }

  return createFixtureCodexAdapter();
}
