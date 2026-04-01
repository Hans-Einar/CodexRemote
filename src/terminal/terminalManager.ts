import { randomUUID } from "node:crypto";

export interface TerminalSessionEvent {
  type: "data" | "exit";
  data?: string;
}

export interface TerminalProcessLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData?(callback: (data: string) => void): void;
  onExit?(callback: (event?: { exitCode?: number }) => void): void;
  on?(event: "data" | "exit", callback: (payload?: unknown) => void): void;
}

export interface CreateTerminalProcessOptions {
  cols: number;
  cwd: string;
  rows: number;
  shell: string;
}

export interface TerminalProcessFactory {
  createProcess(options: CreateTerminalProcessOptions): TerminalProcessLike;
}

interface TerminalSubscription {
  callback: (event: TerminalSessionEvent) => void;
  id: string;
}

interface ManagedTerminalSession {
  id: string;
  process: TerminalProcessLike;
  subscriptions: TerminalSubscription[];
}

function subscribeToProcessData(
  process: TerminalProcessLike,
  callback: (data: string) => void
) {
  if (process.onData) {
    process.onData(callback);
    return;
  }

  process.on?.("data", (payload) => {
    if (typeof payload === "string") {
      callback(payload);
    }
  });
}

function subscribeToProcessExit(
  process: TerminalProcessLike,
  callback: () => void
) {
  if (process.onExit) {
    process.onExit(() => callback());
    return;
  }

  process.on?.("exit", () => callback());
}

export function getDefaultTerminalShell() {
  return process.platform === "win32" ? "powershell.exe" : "bash";
}

export function createTerminalManager(factory: TerminalProcessFactory) {
  const sessions = new Map<string, ManagedTerminalSession>();

  function emit(sessionId: string, event: TerminalSessionEvent) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const subscription of session.subscriptions) {
      subscription.callback(event);
    }
  }

  return {
    createSession(options: { cols: number; cwd: string; rows: number }) {
      const id = randomUUID();
      const process = factory.createProcess({
        ...options,
        shell: getDefaultTerminalShell()
      });

      const session: ManagedTerminalSession = {
        id,
        process,
        subscriptions: []
      };

      sessions.set(id, session);

      subscribeToProcessData(process, (data) => {
        emit(id, {
          data,
          type: "data"
        });
      });

      subscribeToProcessExit(process, () => {
        emit(id, {
          type: "exit"
        });
        sessions.delete(id);
      });

      return {
        id
      };
    },
    dispose(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.process.kill();
      sessions.delete(sessionId);
    },
    resize(sessionId: string, cols: number, rows: number) {
      sessions.get(sessionId)?.process.resize(cols, rows);
    },
    subscribe(sessionId: string, callback: (event: TerminalSessionEvent) => void) {
      const session = sessions.get(sessionId);
      if (!session) {
        return () => undefined;
      }

      const subscription = {
        callback,
        id: randomUUID()
      };

      session.subscriptions.push(subscription);

      return () => {
        const currentSession = sessions.get(sessionId);
        if (!currentSession) {
          return;
        }

        currentSession.subscriptions = currentSession.subscriptions.filter(
          (entry) => entry.id !== subscription.id
        );
      };
    },
    write(sessionId: string, data: string) {
      sessions.get(sessionId)?.process.write(data);
    }
  };
}
