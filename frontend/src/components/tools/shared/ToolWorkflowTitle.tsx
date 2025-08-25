import React from 'react';
import { Flex, Text, Divider } from '@mantine/core';
import LocalIcon from '../../shared/LocalIcon';
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
              <LocalIcon icon="gpp-maybe-rounded" width="20" height="20" style={{ color: 'var(--icon-files-color)' }} />
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
