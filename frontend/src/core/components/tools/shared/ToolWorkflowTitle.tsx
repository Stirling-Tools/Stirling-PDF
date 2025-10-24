import React from 'react';
import { Flex, Text, Divider } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';

export interface ToolWorkflowTitleProps {
  title: string;
  description?: string;
  tooltip?: {
    content?: React.ReactNode;
    tips?: any[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export function ToolWorkflowTitle({ title, tooltip, description }: ToolWorkflowTitleProps) {
  const titleContent = (
    <Flex align="center" gap="xs" onClick={(e) => e.stopPropagation()}>
      <Text fw={500} size="lg" p="xs">
        {title}
      </Text>
      {tooltip && <LocalIcon icon="info-outline-rounded" width="1.25rem" height="1.25rem" style={{ color: 'var(--icon-files-color)' }} />}
    </Flex>
  );

  return (
    <>
      {tooltip ? (
        <Flex justify="center" w="100%">
          <Tooltip
            content={tooltip.content}
            tips={tooltip.tips}
            header={tooltip.header}
            sidebarTooltip={true}
          >
            {titleContent}
          </Tooltip>
        </Flex>
      ) : (
        titleContent
      )}

      <Text size="sm" mb="md" p="sm" style={{borderRadius:'var(--mantine-radius-md)', background: 'var(--color-gray-200)', color: 'var(--mantine-color-text)' }}>
        {description}
      </Text>
      <Divider mb="sm" />
    </>
  );
}
