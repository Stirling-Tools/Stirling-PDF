import { useNavigate } from "react-router-dom";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import {
  requestSigningIntent,
  type SigningIntent,
} from "@app/utils/pendingSigningIntent";

/** Queue the intent only after any unsaved-work prompt has been accepted. */
export function useOpenSigning() {
  const navigate = useNavigate();
  const { actions } = useNavigationActions();
  return (intent: SigningIntent) =>
    actions.requestNavigation(() => {
      requestSigningIntent(intent);
      navigate("/shared-sign");
    });
}
