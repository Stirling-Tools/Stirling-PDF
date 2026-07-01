import { Center, Loader, Overlay, Stack, Text, Alert } from "@mantine/core";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import { useTranslation } from "react-i18next";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

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

  const inFlight = runs.find((r) => IN_FLIGHT.includes(r.status) || r.retrying);
  const failed = inFlight
    ? undefined
    : runs.find((r) => r.status === "FAILED" || r.status === "CANCELLED");

  if (!inFlight && !failed) return null;

  return (
    <Overlay
      color="var(--color-bg)"
      backgroundOpacity={0.88}
      blur={3}
      zIndex={1100}
    >
      <Center style={{ height: "100%" }}>
        {inFlight ? (
          <Stack align="center" gap="sm">
            <Loader size="md" />
            <Text fw={500}>
              {t("policy.enforcingTitle", "Checking policy…")}
            </Text>
            {inFlight.currentStep != null && inFlight.stepCount != null && (
              <Text size="sm" c="dimmed">
                {t("policy.enforcingStep", "Step {{current}} of {{total}}", {
                  current: inFlight.currentStep,
                  total: inFlight.stepCount,
                })}
              </Text>
            )}
          </Stack>
        ) : (
          <Alert
            icon={<GppMaybeOutlinedIcon />}
            color="red"
            title={t("policy.failedTitle", "Policy check failed")}
            maw={420}
          >
            {failed?.error ??
              t(
                "policy.failedBody",
                "This file did not pass the required policy check and cannot be used.",
              )}
          </Alert>
        )}
      </Center>
    </Overlay>
  );
}
