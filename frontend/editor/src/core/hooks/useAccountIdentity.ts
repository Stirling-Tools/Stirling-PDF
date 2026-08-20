import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useProfilePictureUrl } from "@app/hooks/useProfilePictureUrl";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { accountService } from "@app/services/accountService";

export interface AccountIdentity {
  /** Never empty — falls back to a generic "User" so a row is never blank. */
  displayName: string;
  profilePictureUrl: string | null;
  isAnonymous: boolean;
}

/**
 * The signed-in identity as the UI should draw it: one name and one picture,
 * resolved the same way everywhere. Every surface that shows "who am I" (the
 * editor and processor sidebar footers, the account settings page) reads this,
 * so a user can't see one initial in the sidebar and a different one in
 * settings.
 *
 * Resolution order for the name: the auth layer's own displayName (each layer
 * derives it from its native user shape), then the proprietary REST endpoint,
 * then a generic last resort.
 */
export function useAccountIdentity(): AccountIdentity {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { displayName: authDisplayName, isAnonymous } = useAuth();
  const profilePictureUrl = useProfilePictureUrl();
  const [accountUsername, setAccountUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.enableLogin) {
      setAccountUsername(null);
      return;
    }
    if (authDisplayName) {
      // The auth context has a name; don't bother hitting the REST
      // endpoint, but clear any stale cached value from a prior call.
      setAccountUsername(null);
      return;
    }
    accountService
      .getAccountData()
      .then((data) => {
        // Always reflect the latest result - including clearing it on
        // sign-out, when the endpoint returns no username (or 401s into
        // the catch branch below). Without this, signing out would leave
        // the old username on screen.
        setAccountUsername(data?.username ?? null);
      })
      .catch(() => {
        setAccountUsername(null);
      });
  }, [config?.enableLogin, authDisplayName]);

  return {
    displayName:
      authDisplayName ?? accountUsername ?? t("auth.displayName.user", "User"),
    profilePictureUrl,
    isAnonymous,
  };
}
