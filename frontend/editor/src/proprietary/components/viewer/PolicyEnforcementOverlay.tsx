import { useState, useEffect, useRef } from "react";
import { Tooltip, ThemeIcon } from "@mantine/core";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { useTranslation } from "react-i18next";
import {
  POLICY_IN_FLIGHT_STATUSES,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";

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
    // Overlay dismissed — collapsed to a small corner badge so the user can read the PDF.
    return (
      <Tooltip
        label={t("policy.enforcingTitle", "Enforcing policy…")}
        position="left"
        withArrow
      >
        <ThemeIcon
          size={32}
          radius="xl"
          variant="light"
          color="blue"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 1100,
            cursor: "default",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <ShieldOutlinedIcon style={{ fontSize: 16 }} />
        </ThemeIcon>
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
