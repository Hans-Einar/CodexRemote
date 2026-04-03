import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

interface JsonRpcSuccess<Response> {
  id: number;
  jsonrpc: "2.0";
  result: Response;
}

interface JsonRpcError {
  error: {
    code: number;
    message: string;
  };
  id: number | null;
  jsonrpc: "2.0";
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
}

export type AppServerNotification = {
  method: string;
  params: unknown;
};

type NotificationListener = (notification: AppServerNotification) => void;

export interface AppServerTransport {
  close(): void;
  onNotification(listener: NotificationListener): () => void;
  request(method: string, params: unknown): Promise<unknown>;
}

export interface StdioTransportOptions {
  args: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

function createJsonRpcLine(id: number, method: string, params: unknown) {
  return JSON.stringify({
    id,
    jsonrpc: "2.0",
    method,
    params
  });
}

export class JsonRpcStdioTransport implements AppServerTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly notificationListeners = new Set<NotificationListener>();
  private readonly pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: unknown) => void;
    }
  >();

  constructor(options: StdioTransportOptions) {
    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "pipe"
    });

    const output = createInterface({
      input: this.child.stdout
    });

    output.on("line", (line) => {
      try {
        const payload = JSON.parse(line) as
          | JsonRpcSuccess<unknown>
          | JsonRpcError
          | JsonRpcNotification;

        if ("method" in payload && typeof payload.method === "string" && !("id" in payload)) {
          for (const listener of this.notificationListeners) {
            listener({
              method: payload.method,
              params: payload.params
            });
          }
          return;
        }

        if (!("id" in payload) || typeof payload.id !== "number") {
          return;
        }

        const entry = this.pending.get(payload.id);
        if (!entry) {
          return;
        }

        this.pending.delete(payload.id);

        if ("error" in payload) {
          entry.reject(new Error(payload.error.message));
          return;
        }

        if ("result" in payload) {
          entry.resolve(payload.result);
        }
      } catch {
        // Ignore malformed stdout lines that are not JSON-RPC responses.
      }
    });

    this.child.on("exit", () => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error("The app-server process exited before the request completed."));
      }

      this.pending.clear();
    });
  }

  request(method: string, params: unknown) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve
      });

      this.child.stdin.write(`${createJsonRpcLine(id, method, params)}\n`);
    });
  }

  onNotification(listener: NotificationListener) {
    this.notificationListeners.add(listener);

    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  close() {
    this.child.kill();
  }
}
