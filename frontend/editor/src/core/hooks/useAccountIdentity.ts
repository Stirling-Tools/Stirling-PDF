import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import {
  useProfilePictureLoading,
  useProfilePictureUrl,
} from "@app/hooks/useProfilePictureUrl";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { accountService } from "@app/services/accountService";

export interface AccountIdentity {
  /** Never empty — falls back to a generic "User" so a row is never blank. */
  displayName: string;
  profilePictureUrl: string | null;
  isAnonymous: boolean;
  /** Display values may be placeholders until the session, name and picture resolve. */
  loading: boolean;
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
  const { config, loading: configLoading } = useAppConfig();
  const {
    displayName: authDisplayName,
    isAnonymous,
    loading: authLoading,
  } = useAuth();
  const profilePictureUrl = useProfilePictureUrl();
  const profilePictureLoading = useProfilePictureLoading();
  const [accountUsername, setAccountUsername] = useState<
    string | null | undefined
  >(undefined);

  useEffect(() => {
    if (authLoading || !config?.enableLogin || authDisplayName) {
      setAccountUsername(undefined);
      return;
    }
    let active = true;
    accountService
      .getAccountData()
      .then((data) => {
        if (active) setAccountUsername(data?.username ?? null);
      })
      .catch(() => {
        if (active) setAccountUsername(null);
      });
    return () => {
      active = false;
    };
  }, [config?.enableLogin, authDisplayName, authLoading]);

  return {
    displayName:
      authDisplayName ?? accountUsername ?? t("auth.displayName.user", "User"),
    profilePictureUrl,
    isAnonymous,
    loading:
      authLoading ||
      profilePictureLoading ||
      (!authDisplayName &&
        (configLoading ||
          (config?.enableLogin === true && accountUsername === undefined))),
  };
}
