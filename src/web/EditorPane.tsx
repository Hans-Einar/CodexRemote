import Editor from "@monaco-editor/react";

import type { WorkspaceFile } from "../shared/contracts";

function languageForPath(relativePath: string) {
  const extension = relativePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "css":
      return "css";
    case "html":
      return "html";
    case "js":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

export function EditorPane({
  file,
  onChange,
  value
}: {
  file: WorkspaceFile;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="editor-pane__surface">
      <Editor
        height="100%"
        language={languageForPath(file.relativePath)}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          automaticLayout: true,
          minimap: {
            enabled: false
          },
          scrollBeyondLastLine: false
        }}
        path={file.relativePath}
        theme="vs-dark"
        value={value}
      />
    </div>
  );
}
