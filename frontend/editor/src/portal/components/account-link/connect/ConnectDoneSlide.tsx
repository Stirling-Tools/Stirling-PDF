import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MeterBar, remainingMeter } from "@app/billing";
import { fetchWallet, type Wallet } from "@portal/api/billing";
import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import "@portal/components/billing/billing.css";
import "@portal/components/account-link/connect/connect.css";

interface Props {
  /** Closes the dialog before navigating, so a next step doesn't land behind the overlay. */
  onNavigate: () => void;
}

/**
 * A trial this close to spent is the thing worth acting on, so below this the meter grows the
 * upgrade CTA. Above it the meter is information, not a prompt.
 */
const LOW_CREDITS = 100;

/** Chevron on a next-step row, so it reads as somewhere to go rather than a button. */
function Chevron() {
  return (
    <svg
      className="portal-connect__next-chevron"
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
 * Step 3 of the connect flow: confirm the link and route into what it just unlocked.
 *
 * <p>Reached after the admin has been to Stirling and back, so this renders on the callback rather
 * than on the click that started the flow. It is still step 3 of the same dialog, which is the
 * point: the progress bar they left on step 2 is what tells them the round trip worked.
 *
 * <p>The balance is the shared {@link MeterBar}, the same bar the Usage page draws, but not the card
 * around it: that card leads with the plan's headline and price, which at dialog width wrapped over
 * four lines and buried the two things this screen is for. The bar alone says the same thing in
 * one. It reads the wallet rather than hardcoding: the allowance is seeded per team, so an account
 * that has already spent it has nothing left to show, and this is where a stale "500" would show up.
 *
 * <p>Upgrading is a row alongside the others, not a button on the bar, so it cannot wrap and does
 * not compete with the confirmation. It goes to Usage rather than starting checkout here: switching
 * the Processor on is a real flow with quotes, invoices and a resumable bundle that already lives
 * on that page, and a second entry point into it would be a second thing to keep correct.
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
    // First, and only when it is the thing standing in the way.
    ...(lowOnCredits
      ? [
          {
            key: "processor",
            label: t(
              "portal.accountLink.connect.done.switchOnProcessor",
              "Switch on the Processor",
            ),
            path: toPortalPath(VIEW_PATHS.usage),
          },
        ]
      : []),
    {
      key: "team",
      label: t(
        "portal.accountLink.connect.done.inviteTeam",
        "Invite your team",
      ),
      path: toPortalPath(VIEW_PATHS.users),
    },
    {
      key: "pipeline",
      label: t(
        "portal.accountLink.connect.done.buildPipeline",
        "Set up a pipeline",
      ),
      path: `${toPortalPath(VIEW_PATHS.pipelines)}/new`,
    },
    {
      key: "policy",
      label: t("portal.accountLink.connect.done.addPolicy", "Add a policy"),
      path: toPortalPath(VIEW_PATHS.policies),
    },
  ];

  return (
    <>
      {/* What they got, before who it belongs to: the balance is the reward, and putting it first
          leaves every row-shaped thing below it grouped together. */}
      {wallet && (
        <div className="portal-connect__meter">
          {/* No status chip: its tone turns red on an exhausted trial, and a red badge on the
              screen confirming success reads as something having gone wrong. */}
          <MeterBar
            {...remainingMeter(wallet.freeRemaining, wallet.freeAllowance)}
            figure={wallet.freeRemaining.toLocaleString()}
            capSuffix={t(
              "portal.accountLink.connect.done.creditsSuffix",
              "of {{allowance}} free credits left",
              { allowance: wallet.freeAllowance.toLocaleString() },
            )}
            barLabel={t(
              "portal.accountLink.connect.done.creditsBarLabel",
              "Free credits remaining",
            )}
          />
        </div>
      )}

      {/* Which account, in the account's own words. The one thing on this screen that proves the
          link landed where the admin meant it to, rather than on whatever they were last signed
          in as. Read from the SaaS session the callback just deposited, so it is absent exactly
          when that hand-off failed, which the note above already says. */}
      {email && (
        <div className="portal-connect__row portal-connect__row--standalone">
          <span className="portal-connect__row-label">
            {t("portal.accountLink.connect.done.accountLabel", "Account")}
          </span>
          <span className="portal-connect__row-detail">{email}</span>
        </div>
      )}

      <ul className="portal-connect__next">
        {nextSteps.map((step) => (
          <li key={step.key}>
            <button
              type="button"
              className="portal-connect__next-item"
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
