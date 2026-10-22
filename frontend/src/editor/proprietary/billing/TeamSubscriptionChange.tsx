import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import {
  teamSubscriptionChange,
  type PendingTeamChange,
} from "@app/services/serverPlanCheckout";
import { USERS_PER_BLOCK } from "@app/components/shared/stripeCheckout/utils/capacity";

/** Keeps the current allowance separate from Stripe's scheduled renewal change. */
export function TeamSubscriptionChange({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingTeamChange | null>(null);
  const [error, setError] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void teamSubscriptionChange("status")
      .then((result) => {
        if (cancelled) return;
        setPending(result.pending);
        setUnsupported(Boolean(result.unsupportedSchedule));
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const cancel = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await teamSubscriptionChange("cancel", pending.scheduleId);
      setPending(null);
      setError(false);
      window.dispatchEvent(new Event("stirling:billing-updated"));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <Banner
        tone="warning"
        title={t(
          "payment.teamChangeUnavailable",
          "Scheduled Team changes could not be loaded. Refresh to try again.",
        )}
      />
    );
  if (unsupported)
    return (
      <Banner
        tone="warning"
        title={t(
          "payment.teamChangeSupport",
          "Your Team subscription has a scheduled change that needs billing support to adjust.",
        )}
      />
    );
  if (!pending) return null;
  return (
    <Banner
      tone="info"
      title={t(
        "payment.teamChangePending",
        "{{users}} users · {{period}} from {{date}}",
        {
          period:
            pending.interval === "year"
              ? t("payment.yearly", "Yearly")
              : t("payment.monthly", "Monthly"),
          users: pending.quantity * USERS_PER_BLOCK,
          date: new Date(pending.effectiveAt * 1000).toLocaleDateString(),
        },
      )}
      action={
        <Button variant="secondary" disabled={busy} onClick={cancel}>
          {t("payment.cancelTeamChange", "Keep current plan")}
        </Button>
      }
    >
      {t(
        "payment.teamChangeCurrent",
        "Your current allowance remains available until then. Keep your current plan to cancel this change before making another adjustment.",
      )}
    </Banner>
  );
}
