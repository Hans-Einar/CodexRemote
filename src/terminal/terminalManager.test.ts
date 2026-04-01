import { EventEmitter } from "node:events";

import { createTerminalManager, getDefaultTerminalShell } from "./terminalManager";

class FakeTerminalProcess extends EventEmitter {
  writes: string[] = [];
  killed = false;

  write(data: string) {
    this.writes.push(data);
  }

  resize() {
    // noop for the test double
  }

  kill() {
    this.killed = true;
    this.emit("exit", { exitCode: 0 });
  }

  pushData(data: string) {
    this.emit("data", data);
  }
}

describe("terminalManager", () => {
  it("uses PowerShell on Windows", () => {
    if (process.platform === "win32") {
      expect(getDefaultTerminalShell()).toBe("powershell.exe");
    }
  });

  it("creates sessions, forwards input, and broadcasts output", () => {
    const processDouble = new FakeTerminalProcess();
    const factory = vi.fn(() => processDouble);
    const manager = createTerminalManager({
      createProcess: factory
    });

    const session = manager.createSession({
      cols: 100,
      cwd: "C:\\Users\\hanse\\GIT\\CodexRemote",
      rows: 32
    });

    const events: Array<{ type: string; data?: string }> = [];
    const unsubscribe = manager.subscribe(session.id, (event) => {
      events.push(event);
    });

    processDouble.pushData("PS> ");
    manager.write(session.id, "dir\r");

    expect(factory).toHaveBeenCalled();
    expect(processDouble.writes).toEqual(["dir\r"]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data",
          data: "PS> "
        })
      ])
    );

    unsubscribe();
    manager.dispose(session.id);

    expect(processDouble.killed).toBe(true);
  });
});
