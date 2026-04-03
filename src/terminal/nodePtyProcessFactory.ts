import pty from "node-pty";

import type { TerminalProcessFactory } from "./terminalManager";

function isWindows() {
  return process.platform === "win32";
}

function withWindowsFallbacks(env: NodeJS.ProcessEnv) {
  if (!isWindows()) {
    return env;
  }

  return {
    ...env,
    COMSPEC: env.COMSPEC ?? "C:\\WINDOWS\\System32\\cmd.exe",
    SystemRoot: env.SystemRoot ?? "C:\\WINDOWS"
  };
}

export const nodePtyProcessFactory: TerminalProcessFactory = {
  createProcess(options) {
    const baseOptions = {
      cols: options.cols,
      cwd: options.cwd,
      env: withWindowsFallbacks(process.env),
      name: "xterm-color",
      rows: options.rows
    };

    const windowsOptions = isWindows()
      ? {
          useConpty: false
        }
      : {};

    try {
      return pty.spawn(options.shell, [], {
        ...baseOptions,
        ...windowsOptions
      });
    } catch (error) {
      if (isWindows() && options.shell.toLowerCase() !== "cmd.exe") {
        return pty.spawn("cmd.exe", [], {
          ...baseOptions,
          ...windowsOptions
        });
      }

      throw error;
    }
  }
};
