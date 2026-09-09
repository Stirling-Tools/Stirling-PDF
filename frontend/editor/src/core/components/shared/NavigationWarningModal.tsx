import { useRef, useEffect } from "react";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { UnsavedChangesDialog } from "@app/components/shared/UnsavedChangesDialog";

const NavigationWarningModal = () => {
  const {
    showNavigationWarning,
    hasUnsavedChanges,
    pendingNavigation,
    cancelNavigation,
    setHasUnsavedChanges,
    navigationWarningHandlersRef,
  } = useNavigationGuard();

  // Store pendingNavigation in a ref so async handlers always have the latest,
  // not a stale closure captured before an await.
  const pendingNavigationRef = useRef(pendingNavigation);
  useEffect(() => {
    pendingNavigationRef.current = pendingNavigation;
  }, [pendingNavigation]);

  const handleKeepWorking = () => {
    cancelNavigation();
  };

  const finishAndNavigate = () => {
    const nav = pendingNavigationRef.current;
    setHasUnsavedChanges(false);
    cancelNavigation();
    if (nav) {
      nav();
    }
  };

  const handleDiscardChanges = async () => {
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onDiscardAndContinue) {
      await handlers.onDiscardAndContinue();
    }
    finishAndNavigate();
  };

  const handleApplyAndContinue = async () => {
    const handlers = navigationWarningHandlersRef.current;
    try {
      if (handlers?.onApplyAndContinue) {
        await handlers.onApplyAndContinue();
      }
      finishAndNavigate();
    } catch (error) {
      console.error("Failed to apply changes before navigating:", error);
    }
  };

  const handleExportAndContinue = async () => {
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onExportAndContinue) {
      await handlers.onExportAndContinue();
    }
    finishAndNavigate();
  };

  // Read handler availability at render time for button visibility
  const handlers = navigationWarningHandlersRef.current;
  const hasApply = !!handlers?.onApplyAndContinue;
  const hasExport = !!handlers?.onExportAndContinue;

  // Only show modal if there are unsaved changes AND there's an actual pending navigation
  if (!hasUnsavedChanges || !pendingNavigation) {
    return null;
  }

  return (
    <UnsavedChangesDialog
      opened={showNavigationWarning}
      onKeepWorking={handleKeepWorking}
      onDiscard={handleDiscardChanges}
      onSave={hasApply ? handleApplyAndContinue : undefined}
      onExport={hasExport ? handleExportAndContinue : undefined}
    />
  );
};

export default NavigationWarningModal;
