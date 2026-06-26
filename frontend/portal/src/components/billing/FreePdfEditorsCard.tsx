import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  MetricCard,
  MetricStrip,
  StatusBadge,
} from "@shared/components";
import GroupsIcon from "@mui/icons-material/GroupsRounded";
import PersonAddIcon from "@mui/icons-material/PersonAddAltRounded";

/**
 * "Free PDF Editors" team-fleet card. The editors-deployed / active-this-month /
 * PDFs-edited figures come from a fleet-telemetry endpoint that does not exist
 * yet (tracked for a follow-up PR), so they are SAMPLE data — flagged with a
 * Preview badge — and "Invite teammates" is intentionally inert. The layout is
 * built so the page matches the marketing design; swap the constants for live
 * values when the endpoint lands.
 */
const SAMPLE = {
  editorsDeployed: "6",
  activeThisMonth: "4",
  pdfsEdited: "1,240",
};

export function FreePdfEditorsCard() {
  const navigate = useNavigate();
  return (
    <Card padding="loose">
      <div className="portal-billing__fleet-row">
        <div className="portal-billing__editors-id">
          <span className="portal-billing__editors-icon" aria-hidden>
            <GroupsIcon sx={{ fontSize: 26 }} />
          </span>
          <div>
            <h3 className="portal-billing__section-title">
              Free PDF Editors{" "}
              <StatusBadge tone="warning" size="sm" showDot={false}>
                Preview · sample data
              </StatusBadge>
            </h3>
            <p className="portal-billing__section-sub">
              Deploy anywhere, for your whole team.
            </p>
          </div>
        </div>
        <MetricStrip className="portal-billing__fleet-metrics">
          <MetricCard label="Editors deployed" value={SAMPLE.editorsDeployed} />
          <MetricCard label="Active this month" value={SAMPLE.activeThisMonth} />
          <MetricCard label="PDFs edited" value={SAMPLE.pdfsEdited} />
          <MetricCard label="Cost" value="$0" />
        </MetricStrip>
        {/* Opens the Users tab with its invite-member modal (via the ?invite param). */}
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/users?invite=1")}
        >
          Invite teammates
        </Button>
      </div>
    </Card>
  );
}
