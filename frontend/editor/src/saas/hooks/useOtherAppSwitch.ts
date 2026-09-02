import { useNavigate } from "react-router-dom";
import { useProcessorAccess } from "@app/hooks/useProcessorAccess";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * SaaS: the editor's Supabase context never fetches /me, so processor access
 * comes from the backend via {@link useProcessorAccess} — the same signal the
 * processor's own gate uses.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const processorAccess = useProcessorAccess();
  const navigate = useNavigate();
  const { actions } = useNavigationActions();
  if (!processorAccess) return null;
  return {
    app: "processor",
    onOpen: () =>
      // Through the guard, so unsaved edits get the same warning as any other navigation.
      actions.requestNavigation(() => {
        saveEditorReturnPath();
        navigate(PROCESSOR_BASENAME);
      }),
  };
}
