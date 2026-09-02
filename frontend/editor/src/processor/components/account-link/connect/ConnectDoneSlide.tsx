import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MeterBar, remainingMeter } from "@app/billing";
import { fetchWallet, type Wallet } from "@processor/api/billing";
import { useLinkedAccountEmail } from "@processor/hooks/useLinkedAccountEmail";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import "@processor/components/billing/billing.css";
import "@processor/components/account-link/connect/connect.css";

interface Props {
  /** Closes the dialog first, so a next step does not land behind the overlay. */
  onNavigate: () => void;
}

/** Below this the meter grows an upgrade row; above it the meter is information, not a prompt. */
const LOW_CREDITS = 100;

function Chevron() {
  return (
    <svg
      className="processor-connect__next-chevron"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/**
 * The bar without the plan card around it: at dialog width that card's headline and price wrapped
 * over four lines. Upgrading is a row rather than a button on the bar for the same reason, and it
 * goes to Usage rather than starting checkout, which already lives there with its quotes and
 * resumable bundle.
 */
export function ConnectDoneSlide({ onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const email = useLinkedAccountEmail();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWallet()
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch(() => {
        // The wallet needs a live SaaS session and a team that has finished provisioning. Neither
        // is guaranteed the instant a link completes, and neither is worth blocking this screen on.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const go = (path: string) => {
    onNavigate();
    navigate(path);
  };

  const lowOnCredits = wallet != null && wallet.freeRemaining < LOW_CREDITS;

  const nextSteps: { key: string; label: string; path: string }[] = [
    ...(lowOnCredits
      ? [
          {
            key: "processor",
            label: t(
              "processor.accountLink.connect.done.switchOnProcessor",
              "Switch on the Processor",
            ),
            path: toProcessorPath(VIEW_PATHS.usage),
          },
        ]
      : []),
    {
      key: "team",
      label: t(
        "processor.accountLink.connect.done.inviteTeam",
        "Invite your team",
      ),
      path: toProcessorPath(VIEW_PATHS.users),
    },
    {
      key: "pipeline",
      label: t(
        "processor.accountLink.connect.done.buildPipeline",
        "Set up a pipeline",
      ),
      path: `${toProcessorPath(VIEW_PATHS.pipelines)}/new`,
    },
    {
      key: "policy",
      label: t("processor.accountLink.connect.done.addPolicy", "Add a policy"),
      path: toProcessorPath(VIEW_PATHS.policies),
    },
  ];

  return (
    <>
      {wallet && (
        <div className="processor-connect__meter">
          {/* No status chip: its tone goes red on an exhausted trial, which on a success screen
              reads as something having gone wrong. */}
          <MeterBar
            {...remainingMeter(wallet.freeRemaining, wallet.freeAllowance)}
            figure={wallet.freeRemaining.toLocaleString()}
            capSuffix={t(
              "processor.accountLink.connect.done.creditsSuffix",
              "of {{allowance}} free credits left",
              { allowance: wallet.freeAllowance.toLocaleString() },
            )}
            barLabel={t(
              "processor.accountLink.connect.done.creditsBarLabel",
              "Free credits remaining",
            )}
          />
        </div>
      )}

      {/* Proves it landed on the account they meant. Read from the session the callback deposited,
          so it is absent exactly when that hand-off failed — which the note above already says. */}
      {email && (
        <div className="processor-connect__row processor-connect__row--standalone">
          <span className="processor-connect__row-label">
            {t("processor.accountLink.connect.done.accountLabel", "Account")}
          </span>
          <span className="processor-connect__row-detail">{email}</span>
        </div>
      )}

      <ul className="processor-connect__next">
        {nextSteps.map((step) => (
          <li key={step.key}>
            <button
              type="button"
              className="processor-connect__next-item"
              onClick={() => go(step.path)}
            >
              <span>{step.label}</span>
              <Chevron />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
