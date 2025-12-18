import React, { useMemo } from 'react';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { useToolNavigation } from '@app/hooks/useToolNavigation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolId } from '@app/types/toolId';
import LocalIcon from '@app/components/shared/LocalIcon';

// Type for the props that icon wrapper components accept
interface IconWrapperProps {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

// Type for an icon wrapper component
type IconWrapperComponent = React.FC<IconWrapperProps>;

// Factory function to create icon wrapper components
function createIconComponent(iconName: string): IconWrapperComponent {
  return (props: IconWrapperProps) => (
    <LocalIcon icon={iconName} width={24} height={24} {...props} />
  );
}

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: IconWrapperComponent;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, 'href' | 'onClick'>[] = [
  {
    id: 'compress',
    title: 'Compress',
    icon: createIconComponent('compress-rounded'),
  },
  {
    id: 'convert',
    title: 'Convert',
    icon: createIconComponent('swap-horiz-rounded'),
  },
  {
    id: 'sanitize',
    title: 'Sanitize',
    icon: createIconComponent('cleaning-services-rounded'),
  },
  {
    id: 'split',
    title: 'Split',
    icon: createIconComponent('crop-rounded'),
  },
  {
    id: 'ocr',
    title: 'OCR',
    icon: createIconComponent('text-fields-rounded'),
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
