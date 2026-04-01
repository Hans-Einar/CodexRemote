import pty from "node-pty";

import type { TerminalProcessFactory } from "./terminalManager";

export const nodePtyProcessFactory: TerminalProcessFactory = {
  createProcess(options) {
    return pty.spawn(options.shell, [], {
      cols: options.cols,
      cwd: options.cwd,
      env: process.env,
      name: "xterm-color",
      rows: options.rows
    });
  }
};
