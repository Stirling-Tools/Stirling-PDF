import { useMemo } from 'react';
import { useNavigationActions, useNavigationState } from '../contexts/NavigationContext';

// Material UI Icons
import CompressIcon from '@mui/icons-material/Compress';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CropIcon from '@mui/icons-material/Crop';
import TextFieldsIcon from '@mui/icons-material/TextFields';

export interface SuggestedTool {
  name: string;
  title: string;
  icon: React.ComponentType<any>;
  navigate: () => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, 'navigate'>[] = [
  {
    name: 'compress',
    title: 'Compress',
    icon: CompressIcon
  },
  {
    name: 'convert',
    title: 'Convert',
    icon: SwapHorizIcon
  },
  {
    name: 'sanitize',
    title: 'Sanitize',
    icon: CleaningServicesIcon
  },
  {
    name: 'split',
    title: 'Split',
    icon: CropIcon
  },
  {
    name: 'ocr',
    title: 'OCR',
    icon: TextFieldsIcon
  }
];

export function useSuggestedTools(): SuggestedTool[] {
  const { actions } = useNavigationActions();
  const { selectedToolKey } = useNavigationState();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(tool => tool.name !== selectedToolKey);

    // Add navigation function to each tool
    return filteredTools.map(tool => ({
      ...tool,
      navigate: () => actions.handleToolSelect(tool.name)
    }));
  }, [selectedToolKey, actions]);
}
