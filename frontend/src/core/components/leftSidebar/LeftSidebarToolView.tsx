import { ScrollArea } from '@mantine/core';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import ToolRenderer from '@app/components/tools/ToolRenderer';
import { ToolId } from '@app/types/toolId';

interface LeftSidebarToolViewProps {
  selectedToolKey: ToolId;
  onBack: () => void;
}

export function LeftSidebarToolView({ selectedToolKey, onBack }: LeftSidebarToolViewProps) {
  const { t } = useTranslation();
  const { toolRegistry, setPreviewFile } = useToolWorkflow();
  const tool = toolRegistry[selectedToolKey];

  return (
    <div className="left-sidebar-tool-view">
      <div className="left-sidebar-tool-header">
        <button
          className="left-sidebar-back-btn"
          onClick={onBack}
          aria-label={t('leftSidebar.backToFiles', 'Back to files')}
        >
          <ArrowBackRoundedIcon sx={{ fontSize: '1.125rem' }} />
        </button>
        {tool?.icon && (
          <span className="left-sidebar-tool-icon">{tool.icon}</span>
        )}
        <span className="left-sidebar-tool-name">{tool?.name ?? selectedToolKey}</span>
      </div>

      <ScrollArea className="left-sidebar-tool-scroll" type="auto">
        <ToolRenderer
          selectedToolKey={selectedToolKey}
          onPreviewFile={setPreviewFile}
        />
      </ScrollArea>
    </div>
  );
}
