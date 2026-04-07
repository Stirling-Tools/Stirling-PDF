import React from 'react';
import { Collapse, Loader } from '@mantine/core';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AgentTreeNode } from '@app/types/agentChat';

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Find the content from the deepest node that has text (for live streaming display). */
export function findDeepestContent(node: AgentTreeNode): string {
  for (const child of node.children) {
    const childContent = findDeepestContent(child);
    if (childContent) return childContent;
  }
  return node.content;
}

export function AgentTreeRow({
  node,
  messageId,
  onToggle,
}: {
  node: AgentTreeNode;
  messageId: string;
  onToggle: (messageId: string, agentId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpandable = hasChildren;

  return (
    <>
      <div className="agent-row">
        <div
          className={`agent-row-header ${isExpandable ? 'agent-row-header--clickable' : ''}`}
          onClick={() => isExpandable && onToggle(messageId, node.agentId)}
          role={isExpandable ? 'button' : undefined}
          tabIndex={isExpandable ? 0 : undefined}
          onKeyDown={(e) => {
            if (isExpandable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onToggle(messageId, node.agentId);
            }
          }}
        >
          {isExpandable ? (
            <span className="agent-row-chevron">
              {node.expanded ? (
                <ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: '0.875rem' }} />
              )}
            </span>
          ) : (
            <span className="agent-row-dot" />
          )}

          <span className="agent-row-name">{node.agentName}</span>

          <span className="agent-row-status">
            {node.status === 'running' && <Loader size={10} type="dots" />}
            {node.status === 'success' && (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.75rem' }} className="agent-row-success" />
            )}
            {node.status === 'error' && (
              <ErrorOutlineIcon sx={{ fontSize: '0.75rem' }} className="agent-row-error" />
            )}
          </span>

          {node.resultSummary && (
            <span className="agent-row-summary">{node.resultSummary}</span>
          )}

          {node.durationMs != null && (
            <span className="agent-row-duration">{formatDuration(node.durationMs)}</span>
          )}
        </div>
      </div>

      {hasChildren && (
        <Collapse in={node.expanded}>
          <div className="agent-row-children">
            {node.children.map((child) => (
              <AgentTreeRow
                key={child.agentId}
                node={child}
                messageId={messageId}
                onToggle={onToggle}
              />
            ))}
          </div>
        </Collapse>
      )}
    </>
  );
}
