import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Spinner } from "@app/ui";
import { Navigate } from "react-router-dom";
import { useConnectGate } from "@portal/hooks/useConnectGate";

interface Props {
  children: ReactNode;
  fallback: string;
}

/**
 * At the route, not on the buttons: the pipeline builder is reachable from its list, the Documents
 * queue, the connect flow's next steps and a typed URL, and a guard per entry point is one more to
 * remember each time someone adds a link.
 */
export function ConnectGuardedRoute({ children, fallback }: Props) {
  const { t } = useTranslation();
  const { gated, loading, error, retry, connect } = useConnectGate();

  useEffect(() => {
    if (gated) connect();
  }, [gated, connect]);

  if (error)
    return (
      <Banner
        tone="danger"
        title={t("portal.accountLink.gate.error")}
        description={error}
        action={
          <Button onClick={retry}>{t("portal.accountLink.gate.retry")}</Button>
        }
      />
    );
  if (loading) return <Spinner label={t("portal.accountLink.gate.loading")} />;
  if (gated) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
