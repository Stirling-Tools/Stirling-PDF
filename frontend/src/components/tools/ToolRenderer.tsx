import React, { Suspense } from "react";
import { Loader, Center, Stack, Text } from "@mantine/core";
import { useToolManagement } from "../../hooks/useToolManagement";
import { BaseToolProps } from "../../types/tool";

interface ToolRendererProps extends BaseToolProps {
  selectedToolKey: string;
}

// Loading fallback component for lazy-loaded tools
const ToolLoadingFallback = ({ toolName }: { toolName?: string }) => (
  <Center h="100%" w="100%">
    <Stack align="center" gap="md">
      <Loader size="lg" />
      <Text c="dimmed" size="sm">
        {toolName ? `Loading ${toolName}...` : "Loading tool..."}
      </Text>
    </Stack>
  </Center>
);

const ToolRenderer = ({
  selectedToolKey,
  onPreviewFile,
  onComplete,
  onError,
}: ToolRendererProps) => {
  // Get the tool from registry
  const { toolRegistry } = useToolManagement();
  const selectedTool = toolRegistry[selectedToolKey];

  if (!selectedTool || !selectedTool.component) {
    return <div>Tool not found: {selectedToolKey}</div>;
  }

  const ToolComponent = selectedTool.component;

  // Wrap lazy-loaded component with Suspense
  return (
    <Suspense fallback={<ToolLoadingFallback toolName={selectedTool.name} />}>
      <ToolComponent
        onPreviewFile={onPreviewFile}
        onComplete={onComplete}
        onError={onError}
      />
    </Suspense>
  );
};

export default ToolRenderer;
