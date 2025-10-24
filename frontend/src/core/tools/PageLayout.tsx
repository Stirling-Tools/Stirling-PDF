import { useTranslation } from 'react-i18next';
import { createToolFlow } from '../components/tools/shared/createToolFlow';
import { useBaseTool } from '../hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '../types/tool';
import { usePageLayoutParameters } from '../hooks/tools/pageLayout/usePageLayoutParameters';
import { usePageLayoutOperation } from '../hooks/tools/pageLayout/usePageLayoutOperation';
import PageLayoutSettings from '../components/tools/pageLayout/PageLayoutSettings';

const PageLayout = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'pageLayout',
    usePageLayoutParameters,
    usePageLayoutOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: 'Settings',
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <PageLayoutSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t('pageLayout.submit', 'Create Layout'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('pageLayout.title', 'Multi Page Layout Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default PageLayout as ToolComponent;


