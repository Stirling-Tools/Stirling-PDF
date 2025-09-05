import { useState, useCallback } from 'react';
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

  // Get steps (either static array or dynamic function result)
  const stepDefinitions = typeof definition.steps === 'function'
    ? definition.steps(base.params.parameters, base.hasFiles, base.hasResults)
    : definition.steps;

  // State for individual step collapse - each step manages its own collapse state
  const [stepCollapseStates, setStepCollapseStates] = useState<Record<string, boolean>>(() => {
    // Initialize collapse states for all steps
    const initialStates: Record<string, boolean> = {};
    stepDefinitions.forEach((stepDef, index) => {
      // First step starts expanded, others start collapsed
      initialStates[stepDef.key] = index > 0;
    });
    return initialStates;
  });

  const toggleStepCollapse = useCallback((stepKey: string) => {
    setStepCollapseStates(prev => ({
      ...prev,
      [stepKey]: !prev[stepKey]
    }));
  }, []);

  // Build steps from definition - filter and map in separate operations for better typing
  const visibleSteps = stepDefinitions.filter((stepDef) => {
    const isVisible = typeof stepDef.isVisible === 'function'
      ? stepDef.isVisible(base.params.parameters, base.hasFiles, base.hasResults)
      : stepDef.isVisible ?? true;
    return isVisible;
  });

  const steps: MiddleStepConfig[] = visibleSteps.map((stepDef) => ({
    title: stepDef.title(t),
    isCollapsed: base.hasResults ? true : (stepCollapseStates[stepDef.key] ?? false),
    onCollapsedClick: base.hasResults ? base.handleSettingsReset : () => toggleStepCollapse(stepDef.key),
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
