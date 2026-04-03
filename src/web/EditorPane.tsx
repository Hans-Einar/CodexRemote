import Editor, { DiffEditor } from "@monaco-editor/react";

import type { WorkspaceFile } from "../shared/contracts";

function languageForPath(relativePath: string) {
  const extension = relativePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "css":
      return "css";
    case "diff":
      return "diff";
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
  originalValue,
  file,
  onChange,
  readOnly = false,
  value
}: {
  originalValue?: string | null;
  file: WorkspaceFile;
  onChange: (value: string) => void;
  readOnly?: boolean;
  value: string;
}) {
  if (typeof originalValue === "string") {
    return (
      <div className="editor-pane__surface">
        <DiffEditor
          height="100%"
          language={languageForPath(`${file.relativePath}.diff`)}
          modified={value}
          options={{
            automaticLayout: true,
            minimap: {
              enabled: false
            },
            readOnly: true,
            renderSideBySide: false,
            scrollBeyondLastLine: false
          }}
          original={originalValue}
          theme="vs-dark"
        />
      </div>
    );
  }

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
          readOnly,
          scrollBeyondLastLine: false
        }}
        path={file.relativePath}
        theme="vs-dark"
        value={value}
      />
    </div>
  );
}
