import { createServer } from "node:http";
import path from "node:path";

import { createFixtureCodexAdapter } from "../bridge/fixtureCodexAdapter";
import { DEFAULT_API_PORT, DEFAULT_VITE_PORT } from "../config/ports";
import { ProjectRegistry } from "../projects/projectRegistry";
import { attachTerminalSocketServer } from "./attachTerminalSocketServer";
import { createApp } from "./createApp";
import { nodePtyProcessFactory } from "../terminal/nodePtyProcessFactory";
import { createTerminalManager } from "../terminal/terminalManager";

const workspaceRoot = process.cwd();
const projectRegistry = new ProjectRegistry({
  dbPath: path.join(workspaceRoot, "data", "codexremote.sqlite"),
  seedProject: {
    name: path.basename(workspaceRoot) || "Current Workspace",
    rootPath: workspaceRoot
  }
});

const app = createApp({
  apiPort: DEFAULT_API_PORT,
  codexAdapter: createFixtureCodexAdapter(),
  projectRegistry,
  vitePort: DEFAULT_VITE_PORT,
  workspaceRoot
});

const server = createServer(app);
const terminalManager = createTerminalManager(nodePtyProcessFactory);

attachTerminalSocketServer({
  projectRegistry,
  server,
  terminalManager
});

server.listen(DEFAULT_API_PORT, "127.0.0.1", () => {
  console.log(
    `CodexRemote bridge listening on http://127.0.0.1:${DEFAULT_API_PORT} with Vite expected on http://127.0.0.1:${DEFAULT_VITE_PORT}`
  );
});
