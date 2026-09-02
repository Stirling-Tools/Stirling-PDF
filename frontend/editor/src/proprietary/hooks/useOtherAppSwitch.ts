import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `processorAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { processorAccess } = useAuth();
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
