import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useToolPanelSize } from "@editor/hooks/useToolPanelSize";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { Select } from "@editor/ui/Select";
import {
  defaultParameters,
  useCheckAccessibilityParameters,
  type AccessibilityProfile,
} from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityParameters";
import {
  useCheckAccessibilityOperation,
  type CheckAccessibilityOperationHook,
} from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityOperation";
import { AccessibilityResults } from "@editor/components/tools/checkAccessibility/AccessibilityResults";
import type { FileId } from "@editor/types/file";
import { useCheckAccessibilityTips } from "@editor/components/tooltips/useCheckAccessibilityTips";

const PROFILE_OPTIONS: { value: AccessibilityProfile; label: string }[] = [
  { value: "ua1", label: "PDF/UA-1" },
  { value: "ua2", label: "PDF/UA-2 (PDF 2.0)" },
];

const CheckAccessibility = (props: BaseToolProps) => {
  const { t } = useTranslation();
  useToolPanelSize("lg");
  const base = useBaseTool(
    "checkAccessibility",
    useCheckAccessibilityParameters,
    useCheckAccessibilityOperation,
    props,
  );
  const operation = base.operation as CheckAccessibilityOperationHook;
  const hasReports = operation.results.length > 0;
  const [selectedFileId, setSelectedFileId] = useState<FileId | null>(null);
  const profileTips = useCheckAccessibilityTips();

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: hasReports,
    },
    steps: [
      {
        title: t("checkAccessibility.steps.standard", "Standard"),
        isCollapsed: hasReports,
        onCollapsedClick: base.handleSettingsReset,
        tooltip: profileTips,
        content: (
          <Select
            aria-label={t("checkAccessibility.steps.standard", "Standard")}
            options={PROFILE_OPTIONS}
            value={base.params.parameters.profile}
            onChange={(value) =>
              value &&
              base.params.updateParameter(
                "profile",
                value as AccessibilityProfile,
              )
            }
            allowDeselect={false}
            disabled={operation.isLoading}
          />
        ),
      },
      {
        title: t("checkAccessibility.steps.results", "Results"),
        isVisible: hasReports || operation.isLoading,
        isCollapsed: false,
        content: (
          <AccessibilityResults
            operation={operation}
            selectedFileId={selectedFileId}
            onSelectFile={setSelectedFileId}
          />
        ),
      },
    ],
    executeButton: {
      text: t("checkAccessibility.submit", "Check accessibility"),
      loadingText: t("checkAccessibility.checking", "Checking..."),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
      isVisible: !hasReports || operation.isLoading,
      testId: "check-accessibility-submit",
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: t("checkAccessibility.steps.results", "Results"),
      onUndo: base.handleUndo,
    },
  });
};

const CheckAccessibilityTool = CheckAccessibility as ToolComponent;
CheckAccessibilityTool.tool = () => useCheckAccessibilityOperation;
CheckAccessibilityTool.getDefaultParameters = () => ({ ...defaultParameters });

export default CheckAccessibilityTool;
