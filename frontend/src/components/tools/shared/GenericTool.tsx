import { useTranslation } from 'react-i18next';
import { GenericToolProps } from './toolDefinition';
import { useBaseTool } from '../../../hooks/tools/shared/useBaseTool';
import { createToolFlow, MiddleStepConfig } from './createToolFlow';

/**
 * Generic tool component that renders any tool from its definition.
 * Eliminates boilerplate by using declarative configuration.
 */
function GenericTool<TParams>(props: GenericToolProps<TParams>) {
  const { definition } = props;
  const { t } = useTranslation();

  // Use the base tool hook with the definition's hooks
  const base = useBaseTool(
    definition.id,
    definition.useParameters,
    definition.useOperation,
    props
  );

  // Build steps from definition - filter and map in separate operations for better typing
  const visibleSteps = definition.steps.filter((stepDef) => {
    const isVisible = typeof stepDef.isVisible === 'function'
      ? stepDef.isVisible(base.params.parameters, base.hasFiles, base.hasResults)
      : stepDef.isVisible ?? true;
    return isVisible;
  });

  const steps: MiddleStepConfig[] = visibleSteps.map((stepDef) => ({
    title: stepDef.title(t),
    isCollapsed: base.settingsCollapsed,
    onCollapsedClick: base.hasResults ? base.handleSettingsReset : undefined,
    tooltip: stepDef.tooltip?.(t),
    content: (
      <stepDef.component
        parameters={base.params.parameters}
        onParameterChange={base.params.updateParameter}
        disabled={base.endpointLoading}
      />
    ),
  }));

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps,
    executeButton: {
      text: definition.executeButton.text(t),
      isVisible: !base.hasResults,
      loadingText: definition.executeButton.loadingText?.(t) || t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
      testId: definition.executeButton.testId,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: definition.review.title(t),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
      testId: definition.review.testId,
    },
  });
}

export default GenericTool;
