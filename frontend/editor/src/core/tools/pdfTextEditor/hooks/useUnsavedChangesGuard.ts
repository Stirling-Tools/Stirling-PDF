import { useEffect, useRef } from "react";
import { useNavigationActions } from "@app/contexts/NavigationContext";

export interface UnsavedChangesGuardOptions {
  dirty: boolean;
  isDirty?: () => boolean;
  onApply?: () => Promise<void>;
  onDiscard?: () => Promise<void> | void;
}

/** Guard unsaved edits on browser exit and SPA tool navigation. */
export function useUnsavedChangesGuard(
  optionsOrDirty: boolean | UnsavedChangesGuardOptions,
): void {
  const { actions } = useNavigationActions();
  const {
    setHasUnsavedChanges,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  } = actions;

  const options =
    typeof optionsOrDirty === "boolean"
      ? { dirty: optionsOrDirty }
      : optionsOrDirty;

  const { dirty, isDirty, onApply, onDiscard } = options;

  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    setHasUnsavedChanges(dirty);
    return () => setHasUnsavedChanges(false);
  }, [dirty, setHasUnsavedChanges]);

  useEffect(() => {
    if (!isDirtyRef.current) return;
    registerUnsavedChangesChecker(() => isDirtyRef.current?.() ?? false);
    return () => unregisterUnsavedChangesChecker();
  }, [registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

  useEffect(() => {
    if (!onApply && !onDiscard) return;
    registerNavigationWarningHandlers({
      onApplyAndContinue: onApply
        ? async () => {
            await onApplyRef.current?.();
          }
        : undefined,
      onDiscardAndContinue: onDiscard
        ? async () => {
            await onDiscardRef.current?.();
          }
        : undefined,
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    onApply,
    onDiscard,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);
}
