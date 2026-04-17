import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { usePageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import { usePageLayoutOperation } from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import PageLayoutSettings from "@app/components/tools/pageLayout/PageLayoutSettings";
import PageLayoutAdvancedSettings from "@app/components/tools/pageLayout/PageLayoutAdvancedSettings";
import PageLayoutMarginsBordersSettings from "@app/components/tools/pageLayout/PageLayoutMarginsBordersSettings";
import { usePageLayoutTips } from "@app/components/tooltips/PageLayout/usePageLayoutTips";
import { usePageLayoutAdvancedTips } from "@app/components/tooltips/PageLayout/usePageLayoutAdvancedTips";
import { usePageLayoutMarginsBordersTips } from "@app/components/tooltips/PageLayout/usePageLayoutMarginsBordersTips";
import PageLayoutPreview from "@app/components/tools/pageLayout/PageLayoutPreview";

enum PageLayoutStep {
  NONE = "none",
  LAYOUT = "layout",
  ADVANCED = "advanced",
  MARGINS_BORDERS = "marginsBorders",
}

const PageLayout = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "pageLayout",
    usePageLayoutParameters,
    usePageLayoutOperation,
    props,
  );

  const pageLayoutTips = usePageLayoutTips();
  const pageLayoutAdvancedTips = usePageLayoutAdvancedTips();
  const pageLayoutMarginsBordersTips = usePageLayoutMarginsBordersTips();

  const accordion = useAccordionSteps<PageLayoutStep>({
    noneValue: PageLayoutStep.NONE,
    initialStep: PageLayoutStep.LAYOUT,
    stateConditions: {
      hasFiles: base.hasFiles,
      hasResults: base.hasResults,
    },
    afterResults: base.handleSettingsReset,
  });

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    preview: <PageLayoutPreview parameters={base.params.parameters} />,
    steps: [
      {
        title: "Layout settings",
        isCollapsed: accordion.getCollapsedState(PageLayoutStep.LAYOUT),
        onCollapsedClick: () =>
          accordion.handleStepToggle(PageLayoutStep.LAYOUT),
        tooltip: pageLayoutTips,
        content: (
          <PageLayoutSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: "Advanced settings",
        isCollapsed: accordion.getCollapsedState(PageLayoutStep.ADVANCED),
        onCollapsedClick: () =>
          accordion.handleStepToggle(PageLayoutStep.ADVANCED),
        tooltip: pageLayoutAdvancedTips,
        content: (
          <PageLayoutAdvancedSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: "Margins and borders",
        isCollapsed: accordion.getCollapsedState(
          PageLayoutStep.MARGINS_BORDERS,
        ),
        onCollapsedClick: () =>
          accordion.handleStepToggle(PageLayoutStep.MARGINS_BORDERS),
        tooltip: pageLayoutMarginsBordersTips,
        content: (
          <PageLayoutMarginsBordersSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("pageLayout.submit", "Create Layout"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("pageLayout.title", "Multi Page Layout Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default PageLayout as ToolComponent;
