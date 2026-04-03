import { useEffect, useMemo, useState } from "react";

import type { WorkspaceTreeNode } from "../shared/contracts";

function collectAncestorIds(nodes: WorkspaceTreeNode[], targetPath: string, trail: string[] = []): string[] {
  for (const node of nodes) {
    if (node.relativePath === targetPath) {
      return trail;
    }

    if (node.children && node.children.length > 0) {
      const match = collectAncestorIds(node.children, targetPath, [...trail, node.id]);

      if (match.length > 0 || node.children.some((child) => child.relativePath === targetPath)) {
        return match;
      }
    }
  }

  return [];
}

export function FileTree({
  activeFilePath,
  ariaLabel = "Workspace files",
  defaultExpandedIds,
  fileBadgeMap,
  folderBadgeMap,
  nodes,
  onSelectFile
}: {
  activeFilePath: string | null;
  ariaLabel?: string;
  defaultExpandedIds?: string[];
  fileBadgeMap: Map<string, string[]>;
  folderBadgeMap: Map<string, string[]>;
  nodes: WorkspaceTreeNode[];
  onSelectFile: (relativePath: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!defaultExpandedIds || defaultExpandedIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const merged = new Set([...current, ...defaultExpandedIds]);
      return Array.from(merged);
    });
  }, [defaultExpandedIds]);

  const activeAncestors = useMemo(() => {
    if (!activeFilePath) {
      return [];
    }

    return collectAncestorIds(nodes, activeFilePath);
  }, [activeFilePath, nodes]);

  useEffect(() => {
    if (activeAncestors.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const merged = new Set([...current, ...activeAncestors]);
      return Array.from(merged);
    });
  }, [activeAncestors]);

  function toggleFolder(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }

  return (
    <div className="file-tree" role="tree" aria-label={ariaLabel}>
      {nodes.map((node) => (
        <TreeNodeRow
          activeFilePath={activeFilePath}
          depth={0}
          expandedIds={expandedIds}
          fileBadgeMap={fileBadgeMap}
          folderBadgeMap={folderBadgeMap}
          key={node.id}
          node={node}
          onSelectFile={onSelectFile}
          onToggleFolder={toggleFolder}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  activeFilePath,
  depth,
  expandedIds,
  fileBadgeMap,
  folderBadgeMap,
  node,
  onSelectFile,
  onToggleFolder
}: {
  activeFilePath: string | null;
  depth: number;
  expandedIds: string[];
  fileBadgeMap: Map<string, string[]>;
  folderBadgeMap: Map<string, string[]>;
  node: WorkspaceTreeNode;
  onSelectFile: (relativePath: string) => void;
  onToggleFolder: (id: string) => void;
}) {
  const isFolder = node.kind === "directory";
  const isExpanded = isFolder && expandedIds.includes(node.id);
  const isSelected = activeFilePath === node.relativePath;
  const badges = isFolder
    ? folderBadgeMap.get(node.relativePath) ?? []
    : fileBadgeMap.get(node.relativePath) ?? [];

  return (
    <div className="file-tree__node" role="treeitem" aria-expanded={isFolder ? isExpanded : undefined}>
      <button
        aria-label={node.name}
        className={isSelected ? "file-tree__row file-tree__row--selected" : "file-tree__row"}
        onClick={() => {
          if (isFolder) {
            onToggleFolder(node.id);
            return;
          }

          onSelectFile(node.relativePath);
        }}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        type="button"
      >
        <span className="file-tree__caret">{isFolder ? (isExpanded ? "v" : ">") : ""}</span>
        <span
          className={
            isFolder
              ? isExpanded
                ? "file-tree__icon file-tree__icon--folder-open"
                : "file-tree__icon file-tree__icon--folder"
              : "file-tree__icon file-tree__icon--file"
          }
        />
        <span className="file-tree__label">{node.name}</span>
        {badges.length > 0 ? (
          <span className="file-tree__badges">
            {badges.map((badge) => (
              <span className="file-tree__badge" key={badge}>
                {badge}
              </span>
            ))}
          </span>
        ) : null}
      </button>

      {isFolder && isExpanded && node.children && node.children.length > 0 ? (
        <div className="file-tree__children" role="group">
          {node.children.map((child) => (
            <TreeNodeRow
              activeFilePath={activeFilePath}
              depth={depth + 1}
              expandedIds={expandedIds}
              fileBadgeMap={fileBadgeMap}
              folderBadgeMap={folderBadgeMap}
              key={child.id}
              node={child}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
