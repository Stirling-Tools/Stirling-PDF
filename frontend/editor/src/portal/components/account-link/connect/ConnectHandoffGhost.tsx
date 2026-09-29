import { useTranslation } from "react-i18next";
import { Spinner } from "@app/ui";
import "@app/components/account-link/connect.css";

export function ConnectHandoffGhost() {
  const { t } = useTranslation();
  return (
    <div className="portal-connect__ghost" role="status">
      <Spinner size="sm" />
      <p className="portal-connect__lede">
        {t(
          "portal.accountLink.connect.handoff.opening",
          "Opening Stirling sign-in…",
        )}
      </p>
    </div>
  );
}
