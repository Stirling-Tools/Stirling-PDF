// Bridge from the non-React disk reconciliation to the editors' live dirty state.
// NavigationProvider mounts inside FileContextProvider, so FileContext cannot read
// it through a hook; a module seam is how the toast and conflict prompt cross the
// same boundary.

type Checker = () => boolean;

let checker: Checker | null = null;

/** Publish the app's live "something is edited but not committed" answer.
 *  Returns the unregister; a later register replaces an earlier one. */
export function registerUnsavedWorkChecker(next: Checker): () => void {
  checker = next;
  return () => {
    if (checker === next) checker = null;
  };
}

/** Whether an open editor holds edits no version has captured yet. Fails closed:
 *  an unanswerable question must not read as "safe to overwrite". */
export function hasUnsavedWork(): boolean {
  if (!checker) return false;
  try {
    return checker();
  } catch (error) {
    console.error("[unsavedWork] checker threw; assuming unsaved work:", error);
    return true;
  }
}

/** Test seam: the checker is module state and would leak between cases. */
export function __resetUnsavedWork(): void {
  checker = null;
}
