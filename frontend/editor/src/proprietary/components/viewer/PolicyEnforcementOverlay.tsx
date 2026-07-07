import { useState, useEffect, useRef } from "react";
import { Tooltip } from "@mantine/core";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useTranslation } from "react-i18next";
import {
  POLICY_IN_FLIGHT_STATUSES,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import { policyAccentVar } from "@app/components/policies/policyStatus";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";
import "@app/components/shared/PolicyBadges.css";

interface Props {
  runs: PolicyRunRecord[];
}

export function PolicyEnforcementOverlay({ runs }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const prevRunId = useRef<string | undefined>(undefined);

  const inFlight = runs.find(
    (r) => POLICY_IN_FLIGHT_STATUSES.includes(r.status) || r.retrying,
  );

  // Reset dismissed when a new run starts (including retries, which replace the
  // run record with a new runId even while inFlight stays truthy throughout).
  useEffect(() => {
    if (inFlight && inFlight.runId !== prevRunId.current) setDismissed(false);
    prevRunId.current = inFlight?.runId;
  }, [inFlight]);

  if (!inFlight) return null;

  const progress =
    inFlight.currentStep != null && inFlight.stepCount
      ? Math.round((inFlight.currentStep / inFlight.stepCount) * 100)
      : undefined;

  if (dismissed) {
    // Overlay dismissed — collapsed to a corner badge (same design as the
    // per-file policy badges, larger) so the user can read the PDF.
    return (
      <Tooltip
        label={t("policy.enforcingTitle", "Enforcing policy…")}
        position="left"
        withArrow
      >
        <span
          className="policy-badge policy-badge--lg policy-badge--enforcing"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 1100,
            color: policyAccentVar(inFlight.categoryId),
          }}
        >
          <AutorenewIcon style={{ fontSize: 16 }} />
        </span>
      </Tooltip>
    );
  }

  return (
    <PolicyEnforcingOverlay
      enforcing
      zIndex={1100}
      progress={progress}
      onDismiss={() => setDismissed(true)}
    />
  );
}
