import { useMemo } from 'react';
import { useNavigationActions, useNavigationState } from '../contexts/NavigationContext';
import { ToolId } from '../types/toolId';

// Material UI Icons
import CompressIcon from '@mui/icons-material/Compress';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CropIcon from '@mui/icons-material/Crop';
import TextFieldsIcon from '@mui/icons-material/TextFields';

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: React.ComponentType<any>;
  navigate: () => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, 'navigate'>[] = [
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
  const { actions } = useNavigationActions();
  const { selectedTool } = useNavigationState();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(tool => tool.id !== selectedTool);

    // Add navigation function to each tool
    return filteredTools.map(tool => ({
      ...tool,
      navigate: () => actions.setSelectedTool(tool.id)
    }));
  }, [selectedTool, actions]);
}
