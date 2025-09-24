import React, { Suspense } from "react";
import { useToolWorkflow } from "../../contexts/ToolWorkflowContext";
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
  // Get the tool from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = toolRegistry[selectedToolKey];

  if (!selectedTool?.component) {
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
