import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CreatePortfolioSettings from "@app/components/tools/createPortfolio/CreatePortfolioSettings";
import { useCreatePortfolioParameters } from "@app/hooks/tools/createPortfolio/useCreatePortfolioParameters";
import { useCreatePortfolioOperation } from "@app/hooks/tools/createPortfolio/useCreatePortfolioOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useCreatePortfolioTips } from "@app/components/tooltips/useCreatePortfolioTips";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";

const CreatePortfolio = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tips = useCreatePortfolioTips();

  const base = useBaseTool(
    "createPortfolio",
    useCreatePortfolioParameters,
    useCreatePortfolioOperation,
    props,
    { minFiles: 2, ignoreViewerScope: true },
  );

  const { workbench } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const isViewerMode = workbench === "viewer";

  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (isViewerMode && !hasAutoSwitchedRef.current) {
      hasAutoSwitchedRef.current = true;
      navActions.setWorkbench("fileEditor");
    }
  }, []);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 2,
    },
    steps: [
      {
        title: t("createPortfolio.settings", "Portfolio Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: tips,
        content: (
          <CreatePortfolioSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("createPortfolio.submit", "Create Portfolio"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
      disabledReason: isViewerMode ? "viewerMode" : undefined,
    },
    belowExecuteButton:
      isViewerMode && !base.hasResults ? (
        <Stack align="center" gap={6} mx="md" mt={4}>
          <Text size="xs" c="dimmed" ta="center">
            {t(
              "createPortfolio.viewerModeHint",
              "A portfolio needs 2 or more files. Head to the file editor to select them.",
            )}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navActions.setWorkbench("fileEditor")}
          >
            {t("createPortfolio.goToFileEditor", "Go to file editor")}
          </Button>
        </Stack>
      ) : undefined,
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("createPortfolio.title", "Portfolio Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default CreatePortfolio as ToolComponent;
