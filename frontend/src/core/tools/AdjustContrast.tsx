import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { useAdjustContrastParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';
import { useAdjustContrastOperation } from '@app/hooks/tools/adjustContrast/useAdjustContrastOperation';
import AdjustContrastBasicSettings from '@app/components/tools/adjustContrast/AdjustContrastBasicSettings';
import AdjustContrastColorSettings from '@app/components/tools/adjustContrast/AdjustContrastColorSettings';
import AdjustContrastPreview from '@app/components/tools/adjustContrast/AdjustContrastPreview';
import { useAccordionSteps } from '@app/hooks/tools/shared/useAccordionSteps';
import NavigationArrows from '@app/components/shared/filePreview/NavigationArrows';

const AdjustContrast = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'adjustContrast',
    useAdjustContrastParameters,
    useAdjustContrastOperation,
    props
  );

  enum Step { NONE='none', BASIC='basic', COLORS='colors' }
  const accordion = useAccordionSteps<Step>({
    noneValue: Step.NONE,
    initialStep: Step.BASIC,
    stateConditions: { hasFiles: base.hasFiles, hasResults: base.hasResults },
    afterResults: base.handleSettingsReset
  });

  // Track which selected file is being previewed. Clamp when selection changes.
  const [previewIndex, setPreviewIndex] = useState(0);
  const totalSelected = base.selectedFiles.length;

  useEffect(() => {
    if (previewIndex >= totalSelected) {
      setPreviewIndex(Math.max(0, totalSelected - 1));
    }
  }, [totalSelected, previewIndex]);

  const currentFile = useMemo(() => {
    return totalSelected > 0 ? base.selectedFiles[previewIndex] : null;
  }, [base.selectedFiles, previewIndex, totalSelected]);

  const handlePrev = () => setPreviewIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setPreviewIndex((i) => Math.min(totalSelected - 1, i + 1));

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t('adjustContrast.basic', 'Basic Adjustments'),
        isCollapsed: accordion.getCollapsedState(Step.BASIC),
        onCollapsedClick: () => accordion.handleStepToggle(Step.BASIC),
        content: (
          <AdjustContrastBasicSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t('adjustContrast.adjustColors', 'Adjust Colors'),
        isCollapsed: accordion.getCollapsedState(Step.COLORS),
        onCollapsedClick: () => accordion.handleStepToggle(Step.COLORS),
        content: (
          <AdjustContrastColorSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    preview: (
      <div>
        <NavigationArrows
          onPrevious={handlePrev}
          onNext={handleNext}
          disabled={totalSelected <= 1}
        >
          <div style={{ width: '100%' }}>
            <AdjustContrastPreview
              file={currentFile || null}
              parameters={base.params.parameters}
            />
          </div>
        </NavigationArrows>
        {totalSelected > 1 && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-color-muted)' }}>
            {`${previewIndex + 1} of ${totalSelected}`}
          </div>
        )}
      </div>
    ),
    executeButton: {
      text: t('adjustContrast.confirm', 'Confirm'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.hasFiles,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('adjustContrast.results.title', 'Adjusted PDF'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
    forceStepNumbers: true,
  });
};

export default AdjustContrast as ToolComponent;


