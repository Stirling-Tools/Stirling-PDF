import { useMemo } from 'react';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { useToolNavigation } from '@app/hooks/useToolNavigation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolId } from '@app/types/toolId';
import LocalIcon from '@app/components/shared/LocalIcon';

// Icon wrapper components
const CompressIcon = (props: any) => <LocalIcon icon="compress-rounded" width={24} height={24} {...props} />;
const SwapHorizIcon = (props: any) => <LocalIcon icon="swap-horiz-rounded" width={24} height={24} {...props} />;
const CleaningServicesIcon = (props: any) => <LocalIcon icon="cleaning-services-rounded" width={24} height={24} {...props} />;
const CropIcon = (props: any) => <LocalIcon icon="crop-rounded" width={24} height={24} {...props} />;
const TextFieldsIcon = (props: any) => <LocalIcon icon="text-fields-rounded" width={24} height={24} {...props} />;

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: React.ComponentType<any>;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, 'href' | 'onClick'>[] = [
  {
    id: 'compress',
    title: 'Compress',
    icon: CompressIcon
  },
  {
    id: 'convert',
    title: 'Convert',
    icon: SwapHorizIcon
  },
  {
    id: 'sanitize',
    title: 'Sanitize',
    icon: CleaningServicesIcon
  },
  {
    id: 'split',
    title: 'Split',
    icon: CropIcon
  },
  {
    id: 'ocr',
    title: 'OCR',
    icon: TextFieldsIcon
  }
];

export function useSuggestedTools(): SuggestedTool[] {
  const { selectedTool } = useNavigationState();
  const { getToolNavigation } = useToolNavigation();
  const { getSelectedTool } = useToolWorkflow();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(tool => tool.id !== selectedTool);

    // Add navigation props to each tool
    return filteredTools.map(tool => {
      const toolRegistryEntry = getSelectedTool(tool.id);
      if (!toolRegistryEntry) {
        // Fallback for tools not in registry
        return {
          ...tool,
          href: `/${tool.id}`,
          onClick: (e: React.MouseEvent) => { e.preventDefault(); }
        };
      }
      
      const navProps = getToolNavigation(tool.id, toolRegistryEntry);
      return {
        ...tool,
        ...navProps
      };
    });
  }, [selectedTool, getToolNavigation, getSelectedTool]);
}
