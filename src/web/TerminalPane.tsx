import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

function terminalUrl(projectId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/terminal?projectId=${encodeURIComponent(projectId)}`;
}

export function TerminalPane({
  cwdLabel,
  onToggleCollapse,
  projectId
}: {
  cwdLabel: string;
  onToggleCollapse: () => void;
  projectId: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [connectionState, setConnectionState] = useState("Connecting terminal...");

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "IBM Plex Mono, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#0b1012",
        foreground: "#d7e3df"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();

    const socket = new WebSocket(terminalUrl(projectId));

    function sendResize() {
      fitAddon.fit();
      socket.send(
        JSON.stringify({
          cols: terminal.cols,
          rows: terminal.rows,
          type: "resize"
        })
      );
    }

    socket.onopen = () => {
      setConnectionState("PowerShell terminal connected");
      sendResize();
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { data?: string; type: string };

      if (payload.type === "data" && typeof payload.data === "string") {
        terminal.write(payload.data);
      }
    };

    socket.onclose = () => {
      setConnectionState("PowerShell terminal disconnected");
    };

    const dataSubscription = terminal.onData((data) => {
      socket.send(
        JSON.stringify({
          data,
          type: "input"
        })
      );
    });

    window.addEventListener("resize", sendResize);

    return () => {
      window.removeEventListener("resize", sendResize);
      dataSubscription.dispose();
      socket.close();
      terminal.dispose();
    };
  }, [projectId]);

  return (
    <div className="terminal-pane">
      <div className="terminal-pane__header">
        <div>
          <h3>Terminal</h3>
          <p className="session-summary__meta">{cwdLabel}</p>
        </div>
        <div className="terminal-pane__actions">
          <StatusMeta label={connectionState} />
          <button
            aria-label="Collapse terminal"
            className="icon-button"
            onClick={onToggleCollapse}
            type="button"
          >
            v
          </button>
        </div>
      </div>
      <div className="terminal-shell" ref={hostRef} />
    </div>
  );
}

function StatusMeta({ label }: { label: string }) {
  return <span className="terminal-status">{label}</span>;
}
