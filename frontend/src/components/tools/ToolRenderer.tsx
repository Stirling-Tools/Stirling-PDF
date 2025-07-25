import React, { Suspense } from "react";
import { useToolManagement } from "../../hooks/useToolManagement";
import { BaseToolProps } from "../../types/tool";
import ToolLoadingFallback from "./ToolLoadingFallback";

interface ToolRendererProps extends BaseToolProps {
  selectedToolKey: string;
}


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
