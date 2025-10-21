import { useTranslation } from 'react-i18next';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import OverlayPdfsSettings from '@app/components/tools/overlayPdfs/OverlayPdfsSettings';
import { useOverlayPdfsParameters } from '@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters';
import { useOverlayPdfsOperation } from '@app/hooks/tools/overlayPdfs/useOverlayPdfsOperation';
import { useOverlayPdfsTips } from '@app/components/tooltips/useOverlayPdfsTips';

const OverlayPdfs = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'overlay-pdfs',
    useOverlayPdfsParameters,
    useOverlayPdfsOperation,
    props
  );
  const overlayTips = useOverlayPdfsTips();

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t('overlay-pdfs.settings.title', 'Settings'),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: overlayTips,
        content: (
          <OverlayPdfsSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t('overlay-pdfs.submit', 'Overlay and Review'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('overlay-pdfs.results.title', 'Overlay Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default OverlayPdfs as ToolComponent;


