import React from "react";
import { Flex, Text, Divider } from "@mantine/core";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { TooltipTip } from "@editor/types/tips";

export interface ToolWorkflowTitleProps {
  title: string;
  description?: string;
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export function ToolWorkflowTitle({
  title,
  tooltip,
  description,
}: ToolWorkflowTitleProps) {
  return (
    <>
      <Flex justify="center" w="100%">
        <Flex align="center" gap="xs">
          <Text fw={500} size="lg" p="xs">
            {title}
          </Text>
          {tooltip && (
            <InfoTooltip
              title={tooltip.header?.title ?? title}
              tips={tooltip.tips}
              content={tooltip.content}
              position="right"
              width={400}
              iconSize={16}
            />
          )}
        </Flex>
      </Flex>

      <Text
        size="sm"
        mb="md"
        p="sm"
        style={{
          borderRadius: "var(--mantine-radius-md)",
          background: "var(--color-gray-200)",
          color: "var(--mantine-color-text)",
        }}
      >
        {description}
      </Text>
      <Divider mb="sm" />
    </>
  );
}
