import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "@app/ui";

export type ComparePlan = "free" | "team" | "enterprise";

export interface ComparePlansModalProps {
  open: boolean;
  onClose: () => void;
  /** Marks a column as the caller's own plan; null leaves every column unmarked. */
  currentPlan: ComparePlan | null;
  /** Null where the host cannot read one, which drops the figure rather than guessing at it. */
  freeUserLimit: number | null;
  freeAllowance: number | null;
  /**
   * A free wallet carries no Team allowance, so the figure is only ever available to a host that
   * already holds Team. Absent, the row states the shape of the deal without inventing a number.
   */
  teamAllowance?: number | null;
  /** Leader-only doors. An omitted callback drops its button rather than rendering a dead one. */
  onUpgradeTeam?: () => void;
  onExploreEnterprise?: () => void;
}

/** A zero from a host that could not read the real figure is an absence, not a ceiling of none. */
function quoted(n: number | null | undefined): string | null {
  return n != null && n > 0 ? n.toLocaleString() : null;
}

interface Column {
  plan: ComparePlan;
  name: string;
  price: string;
}

interface Row {
  key: string;
  label: string;
  free: string;
  /** Qualifies the Free cell without repeating it in every column. */
  freeNote?: string;
  team: string;
  enterprise: string;
}

/**
 * The plan matrix, opened from the plan section of Usage and Billing.
 *
 * <p>Every row states something the plans genuinely differ on. Sign-in is the exception and is
 * kept deliberately: SSO is on all three, and saying so is the point of the row rather than a gap
 * in it. Nothing here claims Team centralises identity across a fleet, because it does not: each
 * instance configures its own provider, and the fleet the wallet knows about is a seat total.
 */
export function ComparePlansModal({
  open,
  onClose,
  currentPlan,
  freeUserLimit,
  freeAllowance,
  teamAllowance,
  onUpgradeTeam,
  onExploreEnterprise,
}: ComparePlansModalProps) {
  const { t } = useTranslation();

  const columns = useMemo<Column[]>(
    () => [
      {
        plan: "free",
        name: t("portal.billing.compare.freeName", "Free"),
        price: t("portal.billing.compare.freePrice", "No card, no expiry"),
      },
      {
        plan: "team",
        name: t("portal.billing.compare.teamName", "Team"),
        price: t("portal.billing.compare.teamPrice", "$99/mo per 100 users"),
      },
      {
        plan: "enterprise",
        name: t("portal.billing.compare.enterpriseName", "Enterprise"),
        price: t(
          "portal.billing.compare.enterprisePrice",
          "Under your agreement",
        ),
      },
    ],
    [t],
  );

  const rows = useMemo<Row[]>(
    () => [
      {
        key: "users",
        label: t("portal.billing.compare.rowUsers", "Users"),
        free:
          quoted(freeUserLimit) != null
            ? t("portal.billing.compare.freeUsers", "Up to {{users}}", {
                users: quoted(freeUserLimit),
              })
            : t("portal.billing.compare.freeUsersUnknown", "A small team"),
        team: t("portal.billing.compare.teamUsers", "100 per block"),
        enterprise: t("portal.billing.compare.enterpriseUsers", "No ceiling"),
      },
      {
        key: "signin",
        label: t("portal.billing.compare.rowSignIn", "Sign-in"),
        free: t("portal.billing.compare.freeSignIn", "Email, Google and SSO"),
        freeNote: t("portal.billing.compare.freeSignInNote", "OAuth2/OIDC"),
        team: t("portal.billing.compare.teamSignIn", "The same"),
        enterprise: t(
          "portal.billing.compare.enterpriseSignIn",
          "SAML and auditing",
        ),
      },
      {
        key: "where",
        label: t("portal.billing.compare.rowWhere", "Where it runs"),
        free: t(
          "portal.billing.compare.freeWhere",
          "Cloud, desktop or self-hosted",
        ),
        team: t("portal.billing.compare.teamWhere", "Cloud or self-hosted"),
        enterprise: t(
          "portal.billing.compare.enterpriseWhere",
          "Multi-node and air-gapped",
        ),
      },
      {
        key: "processing",
        label: t("portal.billing.compare.rowProcessing", "Processing"),
        free:
          quoted(freeAllowance) != null
            ? t(
                "portal.billing.compare.freeProcessing",
                "{{allowance}} credits a month",
                { allowance: quoted(freeAllowance) },
              )
            : t(
                "portal.billing.compare.freeProcessingUnknown",
                "A monthly credit allowance",
              ),
        team:
          quoted(teamAllowance) != null
            ? t(
                "portal.billing.compare.teamProcessing",
                "{{allowance}} a month, then metered",
                { allowance: quoted(teamAllowance) },
              )
            : t(
                "portal.billing.compare.teamProcessingUnknown",
                "A larger allowance, then metered",
              ),
        enterprise: t(
          "portal.billing.compare.enterpriseProcessing",
          "Metered or flat",
        ),
      },
      {
        key: "data",
        label: t("portal.billing.compare.rowData", "Your data"),
        free: t("portal.billing.compare.freeData", "Stays where you run it"),
        team: t(
          "portal.billing.compare.teamData",
          "Google Drive, your own database",
        ),
        enterprise: t(
          "portal.billing.compare.enterpriseData",
          "Data residency and SCIM",
        ),
      },
      {
        key: "support",
        label: t("portal.billing.compare.rowSupport", "Support"),
        free: t("portal.billing.compare.freeSupport", "Community"),
        team: t("portal.billing.compare.teamSupport", "Email"),
        enterprise: t(
          "portal.billing.compare.enterpriseSupport",
          "Uptime SLAs, deployment help",
        ),
      },
    ],
    [t, freeUserLimit, freeAllowance, teamAllowance],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={t("portal.billing.compare.title", "Compare plans")}
      subtitle={t(
        "portal.billing.compare.lede",
        "Every plan includes every PDF tool and SSO. What changes is how many people use it, where it runs, and what support you get.",
      )}
      footer={
        onUpgradeTeam || onExploreEnterprise ? (
          <div className="billing-compare__actions">
            {onUpgradeTeam && (
              <Button onClick={onUpgradeTeam}>
                {t("portal.billing.compare.upgradeTeam", "Upgrade to Team")}
              </Button>
            )}
            {onExploreEnterprise && (
              <Button variant="secondary" onClick={onExploreEnterprise}>
                {t(
                  "portal.billing.compare.exploreEnterprise",
                  "Explore Enterprise",
                )}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <table className="billing-compare">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">
                {t("portal.billing.compare.rowHeader", "Feature")}
              </span>
            </th>
            {columns.map((c) => (
              <th key={c.plan} scope="col" className="billing-compare__head">
                <span className="billing-compare__plan">
                  {c.name}
                  {currentPlan === c.plan && (
                    <span className="billing-compare__current">
                      {t("portal.billing.compare.current", "Current")}
                    </span>
                  )}
                </span>
                <span className="billing-compare__price">{c.price}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="billing-compare__label">
                {r.label}
              </th>
              <td className="billing-compare__cell">
                {r.free}
                {r.freeNote && (
                  <span className="billing-compare__note">{r.freeNote}</span>
                )}
              </td>
              <td className="billing-compare__cell">{r.team}</td>
              <td className="billing-compare__cell">{r.enterprise}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
