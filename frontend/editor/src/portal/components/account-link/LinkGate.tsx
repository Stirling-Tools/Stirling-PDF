import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState } from "@app/ui";
import { useConnectGate } from "@portal/hooks/useConnectGate";

interface Props {
  /** The gated feature, rendered once the instance is linked. */
  children: ReactNode;
  /** Feature name for the lock copy, e.g. "Pipelines". */
  feature?: string;
  /** Render the empty state bare, for a caller that already supplies a card. */
  bare?: boolean;
}

/**
 * Blocks a feature that needs a linked Stirling account, replacing it with the reason and the
 * remedy.
 *
 * <p>This replaces its children rather than sitting beside them: a blocked feature converts far
 * better than a banner next to a working one, and it is the strongest driver in the connect flow.
 * Scope it to <b>creating and editing</b> and leave viewing alone, so an upgrade never takes away
 * something that already runs.
 *
 * <p>No credit claim here. On the modal the free grant is an inducement; on a gate it reads as a
 * price of entry, and it is not ours to promise anyway (the grant is seeded per team at team
 * creation, not by linking). The gate names the feature and the remedy; the modal makes the case.
 *
 * <p>Renders children untouched when the instance is linked, and also when linking is unavailable
 * on this instance: a server with the feature flag off cannot link, so gating it would lock the
 * feature with no way out.
 */
export function LinkGate({ children, feature, bare = false }: Props) {
  const { t } = useTranslation();
  const { gated, loading, connect } = useConnectGate();

  // Hold rather than flash: painting the gate before the capability lands would show a lock to
  // someone who is about to turn out to be linked.
  if (loading || !gated) return <>{children}</>;

  const body = (
    <EmptyState
      size="default"
      title={
        feature
          ? t(
              "portal.accountLink.gate.titleFeature",
              "{{feature}} need a connected account",
              { feature },
            )
          : t("portal.accountLink.gate.title", "This needs a connected account")
      }
      description={t(
        "portal.accountLink.gate.description",
        "Connect your Stirling account to use this. Manual PDF tools keep working either way.",
      )}
      actions={
        <Button variant="primary" onClick={connect}>
          {t("portal.accountLink.gate.action", "Connect account")}
        </Button>
      }
    />
  );

  return bare ? body : <Card padding="loose">{body}</Card>;
}
