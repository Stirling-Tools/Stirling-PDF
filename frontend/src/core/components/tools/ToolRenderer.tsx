import { Suspense } from "react";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { BaseToolProps } from "@app/types/tool";
import { ToolId } from "@app/types/toolId";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";

interface ToolRendererProps extends BaseToolProps {
  selectedToolKey: ToolId;
}


const ToolRenderer = ({
  selectedToolKey,
  onPreviewFile,
  onComplete,
  onError,
}: ToolRendererProps) => {
  // Get the tool from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = (selectedToolKey in toolRegistry)
    ? toolRegistry[selectedToolKey as ToolId]
    : undefined;

  // Handle tools that only work in workbenches (read, multiTool)
  if (selectedTool && !selectedTool.component && selectedTool.workbench) {
    return null; // These tools render in their workbench, not in the sidebar
  }

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
