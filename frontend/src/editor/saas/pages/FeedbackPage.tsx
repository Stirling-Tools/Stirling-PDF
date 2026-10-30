import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Userback, { getUserback } from "@userback/widget";
import { AuthShell } from "@editor/auth/ui/AuthShell";
import { Button } from "@editor/ui/Button";
import { Logo } from "@editor/ui/Logo";
import styles from "@editor/pages/FeedbackPage.module.css";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

type Stage = "loading" | "ready" | "sent" | "unavailable";

/**
 * Public page that builds without Userback link to for feedback. Userback only
 * loads on whitelisted domains, so a self-hosted or desktop app cannot open it
 * in place. Needs no session: the visitor may have no Stirling account.
 */
export default function FeedbackPage() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>(
    USERBACK_TOKEN ? "loading" : "unavailable",
  );

  useEffect(() => {
    if (!USERBACK_TOKEN) return;
    // A cancelled run ignores the result rather than destroying it: the loader
    // hands every caller the same pending promise.
    let cancelled = false;

    Userback(USERBACK_TOKEN, {
      autohide: true,
      // Not on resolve: the loader resolves at init, before the form can open.
      on_load: () => getUserback()?.open(),
      after_send: () => setStage("sent"),
    })
      .then(() => {
        if (!cancelled) setStage("ready");
      })
      .catch(() => {
        if (!cancelled) setStage("unavailable");
      });

    return () => {
      cancelled = true;
      getUserback()?.destroy();
    };
  }, []);

  const title: Record<Stage, string> = {
    loading: t("feedback.page.title", "Help us improve Stirling"),
    ready: t("feedback.page.title", "Help us improve Stirling"),
    sent: t("feedback.page.sent", "Thanks for your feedback"),
    unavailable: t("feedback.page.unavailable", "Feedback is unavailable"),
  };

  return (
    <AuthShell>
      <header className={styles.header}>
        <Logo variant="iconOnly" iconHeight="2.5rem" />
        <h1 className={styles.title}>{title[stage]}</h1>
      </header>
      {stage !== "unavailable" && (
        <Button
          variant={stage === "sent" ? "secondary" : "primary"}
          fat
          fullWidth
          loading={stage === "loading"}
          onClick={() => getUserback()?.open()}
        >
          {stage === "sent"
            ? t("feedback.page.sendMore", "Send more feedback")
            : t("feedback.page.open", "Send feedback")}
        </Button>
      )}
    </AuthShell>
  );
}
