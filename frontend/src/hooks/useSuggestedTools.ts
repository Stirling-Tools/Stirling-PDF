import { useMemo } from 'react';
import { useToolWorkflow } from '../contexts/ToolWorkflowContext';

// Material UI Icons
import CompressIcon from '@mui/icons-material/Compress';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CropIcon from '@mui/icons-material/Crop';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { ToolId } from '../data/toolsTaxonomy';

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: React.ComponentType<any>;
  navigate: () => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, 'navigate'>[] = [
  {
    id: ToolId.COMPRESS,
    title: 'Compress',
    icon: CompressIcon
  },
  {
    id: ToolId.CONVERT,
    title: 'Convert',
    icon: SwapHorizIcon
  },
  {
    id: ToolId.SANITIZE,
    title: 'Sanitize',
    icon: CleaningServicesIcon
  },
  {
    id: ToolId.SPLIT_PDF,
    title: 'Split',
    icon: CropIcon
  },
  {
    id: ToolId.OCR,
    title: 'OCR',
    icon: TextFieldsIcon
  }
];

export function useSuggestedTools(): SuggestedTool[] {
  const { handleToolSelect, selectedToolKey } = useToolWorkflow();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(tool => tool.id !== selectedToolKey);

    // Add navigation function to each tool
    return filteredTools.map(tool => ({
      ...tool,
      navigate: () => handleToolSelect(tool.id)
    }));
  }, [selectedToolKey, handleToolSelect]);
}
