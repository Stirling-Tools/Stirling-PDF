import { Badge, Popover, Text } from '@mantine/core';
import '@app/components/tools/validateSignature/reportView/styles.css';
import { useTranslation } from 'react-i18next';
import { computeSignatureStatus } from '@app/hooks/tools/validateSignature/utils/signatureStatus';
import type { SignatureValidationSignature } from '@app/types/validateSignature';

const SignatureStatusBadge = ({ signature }: { signature: SignatureValidationSignature }) => {
  const { t } = useTranslation();
  const status = computeSignatureStatus(signature, t);
  const classMap = {
    valid: 'status-badge status-badge--valid',
    warning: 'status-badge status-badge--warning',
    invalid: 'status-badge status-badge--invalid',
    neutral: 'status-badge status-badge--neutral',
  } as const;

  return (
    <Popover withinPortal position="bottom" withArrow shadow="md" disabled={status.details.length === 0}>
      <Popover.Target>
        <Badge className={classMap[status.kind]} variant="light" style={{ cursor: status.details.length ? 'pointer' : 'default' }}>
          {status.label}
        </Badge>
      </Popover.Target>
      {status.details.length > 0 && (
        <Popover.Dropdown>
          <Text size="sm" fw={600} mb={4}>{t('details', 'Details')}</Text>
          {status.details.map((d, i) => (
            <Text size="sm" key={i}>
              - {d}
            </Text>
          ))}
        </Popover.Dropdown>
      )}
    </Popover>
  );
};

export default SignatureStatusBadge;

