import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useFileSelection } from "@app/contexts/FileContext";

import { createToolFlow } from "@app/components/tools/shared/createToolFlow";

import AddPasswordSettings from "@app/components/tools/addPassword/AddPasswordSettings";
import ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";

import { useAddPasswordParameters } from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { useAddPasswordOperation } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { useAddPasswordTips } from "@app/components/tooltips/useAddPasswordTips";
import { useAddPasswordPermissionsTips } from "@app/components/tooltips/useAddPasswordPermissionsTips";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const AddPassword = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const [collapsedPermissions, setCollapsedPermissions] = useState(true);

  const addPasswordParams = useAddPasswordParameters();
  const addPasswordOperation = useAddPasswordOperation();
  const addPasswordTips = useAddPasswordTips();
  const addPasswordPermissionsTips = useAddPasswordPermissionsTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(addPasswordParams.getEndpointName());



  useEffect(() => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
  }, [addPasswordParams.parameters]);

  const handleAddPassword = async () => {
    try {
      await addPasswordOperation.executeOperation(addPasswordParams.fullParameters, selectedFiles);
      if (addPasswordOperation.files && onComplete) {
        onComplete(addPasswordOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("addPassword.error.failed", "Add password operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "addPassword");
  };

  const handleSettingsReset = () => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
  };

  const handleUndo = async () => {
    await addPasswordOperation.undoOperation();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = addPasswordOperation.files.length > 0 || addPasswordOperation.downloadUrl !== null;
  const passwordsCollapsed = !hasFiles || hasResults;
  const permissionsCollapsed = collapsedPermissions || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: t("addPassword.passwords.stepTitle", "Passwords & Encryption"),
        isCollapsed: passwordsCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : undefined,
        tooltip: addPasswordTips,
        content: (
          <AddPasswordSettings
            parameters={addPasswordParams.parameters}
            onParameterChange={addPasswordParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
      {
        title: t("changePermissions.title", "Document Permissions"),
        isCollapsed: permissionsCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedPermissions(!collapsedPermissions),
        content: (
          <ChangePermissionsSettings
            parameters={addPasswordParams.permissions.parameters}
            onParameterChange={addPasswordParams.permissions.updateParameter}
            disabled={endpointLoading}
          />
        ),
        tooltip: addPasswordPermissionsTips,
      },
    ],
    executeButton: {
      text: t("addPassword.submit", "Encrypt"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleAddPassword,
      disabled: !addPasswordParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: addPasswordOperation,
      title: t("addPassword.results.title", "Encrypted PDFs"),
      onFileClick: handleThumbnailClick,
      onUndo: handleUndo,
    },
  });
};

export default AddPassword as ToolComponent;
