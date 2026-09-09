import { Badge, Popover, Text } from "@mantine/core";
import "@app/components/tools/validateSignature/reportView/styles.css";
import { useTranslation } from "react-i18next";
import { computeSignatureStatus } from "@app/hooks/tools/validateSignature/utils/signatureStatus";
import type { SignatureValidationSignature } from "@app/types/validateSignature";

const SignatureStatusBadge = ({
  signature,
}: {
  signature: SignatureValidationSignature;
}) => {
  const { t } = useTranslation();
  const status = computeSignatureStatus(signature, t);
  const classMap = {
    valid: "status-badge status-badge--valid",
    warning: "status-badge status-badge--warning",
    invalid: "status-badge status-badge--invalid",
    neutral: "status-badge status-badge--neutral",
  } as const;

  // With no details there is nothing to open, so the badge stays a plain label.
  // Popover.Target stamps aria-haspopup/aria-expanded onto whatever it wraps,
  // and those are only permitted on an element that is actually a control.
  if (status.details.length === 0) {
    return (
      <Badge className={classMap[status.kind]} variant="light">
        {status.label}
      </Badge>
    );
  }

  return (
    <Popover withinPortal position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Badge
          component="button"
          type="button"
          className={classMap[status.kind]}
          variant="light"
          style={{ cursor: "pointer" }}
        >
          {status.label}
        </Badge>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" fw={600} mb={4}>
          {t("details", "Details")}
        </Text>
        {status.details.map((d, i) => (
          <Text size="sm" key={i}>
            - {d}
          </Text>
        ))}
      </Popover.Dropdown>
    </Popover>
  );
};

export default SignatureStatusBadge;
