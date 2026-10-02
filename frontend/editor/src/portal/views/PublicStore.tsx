import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { Logo } from "@app/ui/Logo";
import { UIProvider } from "@portal/contexts/UIContext";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import {
  StoreAccessProvider,
  signInToContinue,
  type StoreAccess,
} from "@portal/components/store/storeAccess";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import { Store } from "@portal/views/Store";
import { StoreListing } from "@portal/views/StoreListing";
import "@portal/views/PublicStore.css";

interface PublicStoreProps {
  access: Exclude<StoreAccess, "member">;
}

/**
 * The store for anyone the portal gate would turn away (BR-01, AC-04): a guest with no account,
 * or an account without portal access. Only the store's own two routes, under a bar that offers
 * the way in, and none of the portal's providers, whose calls all need a member.
 */
export function PublicStore({ access }: PublicStoreProps) {
  const { t } = useTranslation();
  const storePath = toPortalPath(VIEW_PATHS.store);
  return (
    <UIProvider>
      <StoreAccessProvider value={access}>
        <div className="portal-public-store">
          <header className="portal-public-store__bar">
            <Link to={storePath} className="portal-public-store__home">
              <Logo
                variant="iconAndText"
                iconHeight="1.6rem"
                textHeight="1.3rem"
              />
            </Link>
            {access === "guest" ? (
              <Button variant="primary" size="sm" onClick={signInToContinue}>
                {t("portal.store.guest.signIn")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.href = EDITOR_URL;
                }}
              >
                {t("portal.store.guest.openEditor")}
              </Button>
            )}
          </header>
          <main className="portal-public-store__main">
            <Routes>
              <Route path="store" element={<Store />} />
              <Route path="store/:storeId" element={<StoreListing />} />
              <Route path="*" element={<Navigate to={storePath} replace />} />
            </Routes>
          </main>
        </div>
      </StoreAccessProvider>
    </UIProvider>
  );
}
