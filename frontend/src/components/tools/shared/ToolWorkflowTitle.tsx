import React from 'react';
import { Flex, Text, Divider } from '@mantine/core';
import { Tooltip } from '../../shared/Tooltip';

export interface ToolWorkflowTitleProps {
  title: string;
  tooltip?: {
    content?: React.ReactNode;
    tips?: any[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export function ToolWorkflowTitle({ title, tooltip }: ToolWorkflowTitleProps) {
  if (tooltip) {
    return (
      <>
        <Flex justify="center" w="100%">
          <Tooltip
            content={tooltip.content}
            tips={tooltip.tips}
            header={tooltip.header}
            sidebarTooltip={true}
          >
            <Flex align="center" gap="xs" onClick={(e) => e.stopPropagation()}>
              <Text fw={500} size="xl" p="md">
                {title}
              </Text>
              <span className="material-symbols-rounded" style={{ fontSize: '1.2rem', color: 'var(--icon-files-color)' }}>
                gpp_maybe
              </span>
            </Flex>
          </Tooltip>
        </Flex>
        <Divider />
      </>
    );
  }

  return (
    <>
      <Flex justify="center" w="100%">
        <Text fw={500} size="xl" p="md">
          {title}
        </Text>
      </Flex>
      <Divider />
    </>
  );
}
