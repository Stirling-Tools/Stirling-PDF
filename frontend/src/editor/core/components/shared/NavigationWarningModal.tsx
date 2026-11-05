import { useRef, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigationGuard } from "@editor/contexts/NavigationContext";
import { UnsavedChangesDialog } from "@editor/components/shared/UnsavedChangesDialog";

const NavigationWarningModal = () => {
  const {
    showNavigationWarning,
    hasUnsavedChanges,
    pendingNavigation,
    cancelNavigation,
    setHasUnsavedChanges,
    navigationWarningHandlersRef,
  } = useNavigationGuard();

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Store pendingNavigation in a ref so async handlers always have the latest,
  // not a stale closure captured before an await.
  const pendingNavigationRef = useRef(pendingNavigation);
  useEffect(() => {
    pendingNavigationRef.current = pendingNavigation;
  }, [pendingNavigation]);

  const handleKeepWorking = () => {
    if (savingRef.current) return;
    cancelNavigation();
  };

  const finishAndNavigate = () => {
    const nav = pendingNavigationRef.current;
    // Compound navigation can invoke more guards; they must see the resolved edits.
    flushSync(() => {
      setHasUnsavedChanges(false);
      cancelNavigation();
    });
    if (nav) {
      nav();
    }
  };

  const handleDiscardChanges = async () => {
    if (savingRef.current) return;
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onDiscardAndContinue) {
      await handlers.onDiscardAndContinue();
    }
    finishAndNavigate();
  };

  const handleApplyAndContinue = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const handlers = navigationWarningHandlersRef.current;
    try {
      if (handlers?.onApplyAndContinue) {
        await handlers.onApplyAndContinue();
      }
      finishAndNavigate();
    } catch (error) {
      console.error("Failed to apply changes before navigating:", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
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
      saving={saving}
      onKeepWorking={handleKeepWorking}
      onDiscard={handleDiscardChanges}
      onSave={hasApply ? handleApplyAndContinue : undefined}
      onExport={hasExport ? handleExportAndContinue : undefined}
    />
  );
};

export default NavigationWarningModal;
