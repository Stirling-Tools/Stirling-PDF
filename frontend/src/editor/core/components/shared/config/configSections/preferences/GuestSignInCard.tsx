import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { withBasePath } from "@editor/constants/app";
import "@editor/components/shared/config/configSections/preferences/GuestSignInCard.css";

/**
 * The sign-in offer a guest sees where an account would otherwise be: it stands
 * in for the account cards on the Preferences page and for the account row in
 * the sidebars.
 *
 * Only rendered when the server allows guests (`security.allowAnonymousAccess`)
 * and nobody is signed in, so a normal install never sees it and a signed-in
 * user keeps the real account cards.
 */
export function GuestSignInCard() {
  const { t } = useTranslation();
  const { session, isAnonymous } = useAuth();
  const { config } = useAppConfig();

  const guest =
    config?.enableLogin === true &&
    config?.allowAnonymousAccess === true &&
    (session === null || isAnonymous);
  if (!guest) return null;

  // A full navigation, not a router push: /login lives outside the app frame and
  // the sign-in has to run with the login page's own providers.
  const signIn = () => {
    window.location.assign(withBasePath("/login"));
  };

  return (
    <section className="guest-signin-card" aria-labelledby="guest-signin-title">
      <div className="guest-signin-card__text">
        <h2 id="guest-signin-title" className="guest-signin-card__title">
          {t("guestAccess.title", "You are using M13A as a guest")}
        </h2>
        <p className="guest-signin-card__body">
          {t(
            "guestAccess.body",
            "Every PDF tool works without an account. Sign in as an administrator to open the server settings, stored files, teams and API keys.",
          )}
        </p>
      </div>
      <button type="button" className="guest-signin-card__cta" onClick={signIn}>
        <Icon name="log-in" size="1rem" />
        {t("guestAccess.signIn", "Sign in as administrator")}
      </button>
    </section>
  );
}

export default GuestSignInCard;
