import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";

import { useChangePermissionsParameters } from "../hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "../hooks/tools/changePermissions/useChangePermissionsOperation";
import { useChangePermissionsTips } from "../components/tooltips/useChangePermissionsTips";
import { BaseToolProps } from "../types/tool";

const ChangePermissions = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const changePermissionsParams = useChangePermissionsParameters();
  const changePermissionsOperation = useChangePermissionsOperation();
  const changePermissionsTips = useChangePermissionsTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(changePermissionsParams.getEndpointName());

  useEffect(() => {
    changePermissionsOperation.resetResults();
    onPreviewFile?.(null);
  }, [changePermissionsParams.parameters]);

  const handleChangePermissions = async () => {
    try {
      await changePermissionsOperation.executeOperation(changePermissionsParams.parameters, selectedFiles);
      if (changePermissionsOperation.files && onComplete) {
        onComplete(changePermissionsOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(
          error instanceof Error ? error.message : t("changePermissions.error.failed", "Change permissions operation failed")
        );
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "changePermissions");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    changePermissionsOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("changePermissions");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = changePermissionsOperation.files.length > 0 || changePermissionsOperation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
    },
    steps: [
      {
        title: t("changePermissions.title", "Document Permissions"),
        isCollapsed: settingsCollapsed,
        onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
        tooltip: changePermissionsTips,
        content: (
          <ChangePermissionsSettings
            parameters={changePermissionsParams.parameters}
            onParameterChange={changePermissionsParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("changePermissions.submit", "Change Permissions"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleChangePermissions,
      disabled: !changePermissionsParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: changePermissionsOperation,
      title: t("changePermissions.results.title", "Modified PDFs"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default ChangePermissions;
