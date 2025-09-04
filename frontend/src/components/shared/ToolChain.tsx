/**
 * Reusable ToolChain component with smart truncation and tooltip expansion
 * Used across FileListItem, FileDetails, and FileThumbnail for consistent display
 */

import React from 'react';
import { Text, Tooltip, Badge, Group } from '@mantine/core';
import { ToolOperation } from '../../types/file';

interface ToolChainProps {
  toolChain: ToolOperation[];
  maxWidth?: string;
  displayStyle?: 'text' | 'badges' | 'compact';
  size?: 'xs' | 'sm' | 'md';
  color?: string;
}

const ToolChain: React.FC<ToolChainProps> = ({
  toolChain,
  maxWidth = '100%',
  displayStyle = 'text',
  size = 'xs',
  color = 'var(--mantine-color-blue-7)'
}) => {
  if (!toolChain || toolChain.length === 0) return null;

  const toolNames = toolChain.map(tool => tool.toolName);

  // Create full tool chain for tooltip
  const fullChainDisplay = displayStyle === 'badges' ? (
    <Group gap="xs" wrap="wrap">
      {toolChain.map((tool, index) => (
        <React.Fragment key={`${tool.toolName}-${index}`}>
          <Badge size="sm" variant="light" color="blue">
            {tool.toolName}
          </Badge>
          {index < toolChain.length - 1 && (
            <Text size="sm" c="dimmed">→</Text>
          )}
        </React.Fragment>
      ))}
    </Group>
  ) : (
    <Text size="sm">{toolNames.join(' → ')}</Text>
  );

  // Create truncated display based on available space
  const getTruncatedDisplay = () => {
    if (toolNames.length <= 2) {
      // Show all tools if 2 or fewer
      return { text: toolNames.join(' → '), isTruncated: false };
    } else {
      // Show first tool ... last tool for longer chains
      return {
        text: `${toolNames[0]} → +${toolNames.length-2} → ${toolNames[toolNames.length - 1]}`,
        isTruncated: true
      };
    }
  };

  const { text: truncatedText, isTruncated } = getTruncatedDisplay();

  // Compact style for very small spaces
  if (displayStyle === 'compact') {
    const compactText = toolNames.length === 1 ? toolNames[0] : `${toolNames.length} tools`;
    const isCompactTruncated = toolNames.length > 1;

    const compactElement = (
      <Text
        size={size}
        style={{
          color,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: `${maxWidth}`,
          cursor: isCompactTruncated ? 'help' : 'default'
        }}
      >
        {compactText}
      </Text>
    );

    return isCompactTruncated ? (
      <Tooltip label={fullChainDisplay} multiline withinPortal>
        {compactElement}
      </Tooltip>
    ) : compactElement;
  }

  // Badge style for file details
  if (displayStyle === 'badges') {
    const isBadgesTruncated = toolChain.length > 3;

    const badgesElement = (
      <div style={{ maxWidth: `${maxWidth}`, overflow: 'hidden' }}>
        <Group gap="2px" wrap="nowrap">
          {toolChain.slice(0, 3).map((tool, index) => (
            <React.Fragment key={`${tool.toolName}-${index}`}>
              <Badge size={size} variant="light" color="blue">
                {tool.toolName}
              </Badge>
              {index < Math.min(toolChain.length - 1, 2) && (
                <Text size="xs" c="dimmed">→</Text>
              )}
            </React.Fragment>
          ))}
          {toolChain.length > 3 && (
            <>
              <Text size="xs" c="dimmed">...</Text>
              <Badge size={size} variant="light" color="blue">
                {toolChain[toolChain.length - 1].toolName}
              </Badge>
            </>
          )}
        </Group>
      </div>
    );

    return isBadgesTruncated ? (
      <Tooltip label={`${toolNames.join(' → ')}`} withinPortal>
        {badgesElement}
      </Tooltip>
    ) : badgesElement;
  }

  // Text style (default) for file list items
  const textElement = (
    <Text
      size={size}
      style={{
        color,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: `${maxWidth}px`,
        cursor: isTruncated ? 'help' : 'default'
      }}
    >
      {truncatedText}
    </Text>
  );

  return isTruncated ? (
    <Tooltip label={fullChainDisplay} withinPortal>
      {textElement}
    </Tooltip>
  ) : textElement;
};

export default ToolChain;
