import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, MetricCard, MetricStrip } from "@app/ui";
import GroupsIcon from "@mui/icons-material/GroupsRounded";
import PersonAddIcon from "@mui/icons-material/PersonAddAltRounded";
import { useFleetStats } from "@portal/queries/infrastructure";

/**
 * "Free PDF Editors" team-fleet card. Editors-deployed / active-this-month /
 * PDFs-edited come from the instance's usage endpoint
 * ({@code GET /api/v1/usage/fleet-stats}), derived from the audit trail filtered
 * to free UI tool runs. A figure the backend can't compute (e.g. EE auditing is
 * off) arrives as null and renders "N/A". Cost is always $0.
 */
function fmtMetric(value: number | null | undefined, loading: boolean): string {
  if (loading) return "—";
  if (value == null) return "N/A";
  return value.toLocaleString();
}

export function FreePdfEditorsCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, loading } = useFleetStats();
  return (
    <Card padding="loose">
      <div className="portal-billing__fleet-row">
        <div className="portal-billing__editors-id">
          <span className="portal-billing__editors-icon" aria-hidden>
            <GroupsIcon sx={{ fontSize: 26 }} />
          </span>
          <div>
            <h3 className="portal-billing__section-title">
              {t("portal.billing.freeEditors.title", "Free PDF Editors")}
            </h3>
            <p className="portal-billing__section-sub">
              {t(
                "portal.billing.freeEditors.subtitle",
                "Deploy anywhere, for your whole team.",
              )}
            </p>
          </div>
        </div>
        <MetricStrip className="portal-billing__fleet-metrics">
          <MetricCard
            label={t(
              "portal.billing.freeEditors.editorsDeployed",
              "Editors deployed",
            )}
            value={fmtMetric(data?.editorsDeployed, loading)}
          />
          <MetricCard
            label={t(
              "portal.billing.freeEditors.activeThisMonth",
              "Active this month",
            )}
            value={fmtMetric(data?.activeThisMonth, loading)}
          />
          <MetricCard
            label={t("portal.billing.freeEditors.pdfsEdited", "PDFs edited")}
            value={fmtMetric(data?.pdfsProcessed, loading)}
          />
          <MetricCard
            label={t("portal.billing.freeEditors.cost", "Cost")}
            value="$0"
          />
        </MetricStrip>
        {/* Opens the Users tab with its invite-member modal (via the ?invite param). */}
        <Button
          variant="secondary"
          size="sm"
          leftSection={<PersonAddIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/users?invite=1")}
        >
          {t("portal.billing.freeEditors.inviteTeammates", "Invite teammates")}
        </Button>
      </div>
    </Card>
  );
}
