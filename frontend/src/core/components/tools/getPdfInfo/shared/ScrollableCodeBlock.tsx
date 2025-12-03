import React from 'react';
import { Code, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface ScrollableCodeBlockProps {
  content: string | null | undefined;
  maxHeight?: string;
  emptyMessage?: string;
}

/**
 * A reusable scrollable code block component with consistent styling.
 * Used for displaying large text content like XMP metadata or structure trees.
 */
const ScrollableCodeBlock: React.FC<ScrollableCodeBlockProps> = ({
  content,
  maxHeight = '400px',
  emptyMessage,
}) => {
  const { t } = useTranslation();

  if (!content) {
    return (
      <Text size="sm" c="dimmed">
        {emptyMessage ?? t('getPdfInfo.noneDetected', 'None detected')}
      </Text>
    );
  }

  return (
    <Code
      block
      style={{
        whiteSpace: 'pre-wrap',
        backgroundColor: 'var(--bg-raised)',
        color: 'var(--text-primary)',
        maxHeight,
        overflowY: 'auto',
      }}
    >
      {content}
    </Code>
  );
};

export default ScrollableCodeBlock;

