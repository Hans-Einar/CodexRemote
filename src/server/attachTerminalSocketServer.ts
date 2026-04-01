import type { Server as HttpServer } from "node:http";
import { URL } from "node:url";

import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";

import type { ProjectRegistry } from "../projects/projectRegistry";
import { createTerminalManager } from "../terminal/terminalManager";

interface AttachTerminalSocketServerOptions {
  projectRegistry: ProjectRegistry;
  server: HttpServer;
  terminalManager: ReturnType<typeof createTerminalManager>;
}

interface TerminalSocketInputMessage {
  data?: string;
  type: "input" | "resize";
  cols?: number;
  rows?: number;
}

export function attachTerminalSocketServer(options: AttachTerminalSocketServerOptions) {
  const webSocketServer = new WebSocketServer({
    path: "/api/terminal",
    server: options.server
  });

  webSocketServer.on("connection", (socket: WebSocket, request) => {
    const requestUrl = new URL(request.url ?? "/api/terminal", "http://127.0.0.1");
    const projectId = requestUrl.searchParams.get("projectId") ?? undefined;
    const project = options.projectRegistry.resolveProject(projectId);
    const session = options.terminalManager.createSession({
      cols: 100,
      cwd: project.rootPath,
      rows: 32
    });

    const unsubscribe = options.terminalManager.subscribe(session.id, (event) => {
      socket.send(JSON.stringify(event));
    });

    socket.send(
      JSON.stringify({
        type: "data",
        data: "PowerShell ready\r\n"
      })
    );

    socket.on("message", (rawMessage: RawData) => {
      const message = JSON.parse(rawMessage.toString()) as TerminalSocketInputMessage;

      if (message.type === "input" && typeof message.data === "string") {
        options.terminalManager.write(session.id, message.data);
      }

      if (
        message.type === "resize" &&
        typeof message.cols === "number" &&
        typeof message.rows === "number"
      ) {
        options.terminalManager.resize(session.id, message.cols, message.rows);
      }
    });

    socket.on("close", () => {
      unsubscribe();
      options.terminalManager.dispose(session.id);
    });
  });

  return webSocketServer;
}
