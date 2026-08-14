import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@app/ui";
import { fetchWallet } from "@portal/api/billing";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import "@portal/components/account-link/connect/connect.css";

interface Props {
  /** Closes the dialog before navigating, so a next step doesn't land behind the overlay. */
  onNavigate: () => void;
}

/**
 * Step 3 of the Connect flow: confirm the link and route into what it just unlocked.
 *
 * <p>A flow that ends by closing itself wastes the one moment the admin is most willing to act, so
 * the three rows deep link into the features step 1 promised.
 *
 * <p>The balance is read from the wallet rather than hardcoded. The free allowance is seeded per
 * team at team creation, so an account that has already spent it has nothing left to show, and this
 * is precisely the screen where a stale "500" would be caught. When the wallet cannot be read the
 * figure is omitted rather than guessed.
 */
export function ConnectDoneSlide({ onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWallet()
      .then((wallet) => {
        if (!cancelled) setFreeRemaining(wallet.freeRemaining);
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

  const nextSteps: { key: string; label: string; path: string }[] = [
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
      <p className="portal-connect__lede">
        {t(
          "portal.accountLink.connect.done.lede",
          "This server now runs against your Stirling account.",
        )}
      </p>

      {freeRemaining != null && (
        <p className="portal-connect__balance">
          <span className="portal-connect__balance-figure">
            {freeRemaining.toLocaleString()}
          </span>
          <span className="portal-connect__balance-label">
            {t(
              "portal.accountLink.connect.done.creditsRemaining",
              "free credits remaining",
            )}
          </span>
        </p>
      )}

      <ul className="portal-connect__next">
        {nextSteps.map((step) => (
          <li key={step.key} className="portal-connect__next-item">
            <Button
              variant="secondary"
              accent="neutral"
              fullWidth
              onClick={() => go(step.path)}
            >
              {step.label}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
