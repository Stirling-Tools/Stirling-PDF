import { useMemo } from "react";
import type { IconName } from "@app/ui/Icon";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId } from "@app/types/toolId";

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: IconName;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, "href" | "onClick">[] = [
  {
    id: "compress",
    title: "Compress",
    icon: "shrink",
  },
  {
    id: "convert",
    title: "Convert",
    icon: "arrow-left-right",
  },
  {
    id: "sanitize",
    title: "Sanitize",
    icon: "brush-cleaning",
  },
  {
    id: "split",
    title: "Split",
    icon: "crop",
  },
  {
    id: "ocr",
    title: "OCR",
    icon: "type",
  },
];

export function useSuggestedTools(): SuggestedTool[] {
  const { selectedTool } = useNavigationState();
  const { getToolNavigation } = useToolNavigation();
  const { getSelectedTool } = useToolWorkflow();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(
      (tool) => tool.id !== selectedTool,
    );

    // Add navigation props to each tool
    return filteredTools.map((tool) => {
      const toolRegistryEntry = getSelectedTool(tool.id);
      if (!toolRegistryEntry) {
        // Fallback for tools not in registry
        return {
          ...tool,
          href: `/${tool.id}`,
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
          },
        };
      }

      const navProps = getToolNavigation(tool.id, toolRegistryEntry);
      return {
        ...tool,
        ...navProps,
      };
    });
  }, [selectedTool, getToolNavigation, getSelectedTool]);
}
