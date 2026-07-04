import { useState, useEffect, useRef } from "react";
import { Center, Overlay, Alert, Tooltip, ThemeIcon } from "@mantine/core";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { useTranslation } from "react-i18next";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";

interface Props {
  runs: PolicyRunRecord[];
}

const IN_FLIGHT: Array<PolicyRunRecord["status"]> = [
  "PENDING",
  "RUNNING",
  "WAITING_FOR_INPUT",
];

export function PolicyEnforcementOverlay({ runs }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const prevRunId = useRef<string | undefined>(undefined);

  const inFlight = runs.find((r) => IN_FLIGHT.includes(r.status) || r.retrying);
  const failed = inFlight
    ? undefined
    : runs.find((r) => r.status === "FAILED" || r.status === "CANCELLED");

  // Reset dismissed when a new run starts (including retries, which replace the
  // run record with a new runId even while inFlight stays truthy throughout).
  useEffect(() => {
    if (inFlight && inFlight.runId !== prevRunId.current) setDismissed(false);
    prevRunId.current = inFlight?.runId;
  }, [inFlight]);

  if (!inFlight && !failed) return null;

  if (inFlight) {
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

  return (
    <Overlay color="var(--color-bg)" backgroundOpacity={0.9} blur={4} zIndex={1100}>
      <Center style={{ height: "100%" }}>
        <Alert
          icon={<GppMaybeOutlinedIcon />}
          color="red"
          title={t("policy.failedTitle", "Policy check failed")}
          maw={380}
        >
          {failed?.error ??
            t(
              "policy.failedBody",
              "This file did not pass the required policy check and cannot be used.",
            )}
        </Alert>
      </Center>
    </Overlay>
  );
}
