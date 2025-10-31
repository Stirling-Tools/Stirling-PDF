import { Divider, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SignatureValidationSignature } from '@app/types/validateSignature';
import SignatureStatusBadge from '@app/components/tools/validateSignature/reportView/SignatureStatusBadge';
import FieldBlock from '@app/components/tools/validateSignature/reportView/FieldBlock';
import '@app/components/tools/validateSignature/reportView/styles.css';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return value;
};

const SignatureSection = ({
  signature,
  index,
}: {
  signature: SignatureValidationSignature;
  index: number;
}) => {
  const { t } = useTranslation();
  const signatureFields = [
    FieldBlock(t('validateSignature.signer', 'Signer'), signature.signerName || '-'),
    FieldBlock(t('validateSignature.date', 'Date'), formatDate(signature.signatureDate)),
    FieldBlock(t('validateSignature.reason', 'Reason'), signature.reason || '-'),
    FieldBlock(t('validateSignature.location', 'Location'), signature.location || '-'),
  ];

  const certificateFields = [
    FieldBlock(t('validateSignature.cert.issuer', 'Issuer'), signature.issuerDN || '-'),
    FieldBlock(t('validateSignature.cert.subject', 'Subject'), signature.subjectDN || '-'),
    FieldBlock(t('validateSignature.cert.serialNumber', 'Serial Number'), signature.serialNumber || '-'),
    FieldBlock(t('validateSignature.cert.validFrom', 'Valid From'), formatDate(signature.validFrom)),
    FieldBlock(t('validateSignature.cert.validUntil', 'Valid Until'), formatDate(signature.validUntil)),
    FieldBlock(t('validateSignature.cert.algorithm', 'Algorithm'), signature.signatureAlgorithm || '-'),
    FieldBlock(
      t('validateSignature.cert.keySize', 'Key Size'),
      signature.keySize != null ? `${signature.keySize} ${t('validateSignature.cert.bits', 'bits')}` : '--'
    ),
    FieldBlock(t('validateSignature.cert.version', 'Version'), signature.version || '-'),
    FieldBlock(
      t('validateSignature.cert.keyUsage', 'Key Usage'),
      signature.keyUsages.length > 0 ? signature.keyUsages.join(', ') : '--'
    ),
    FieldBlock(t('validateSignature.cert.selfSigned', 'Self-Signed'), signature.selfSigned ? t('yes', 'Yes') : t('no', 'No')),
  ];

  return (
    <Stack gap="md" key={signature.id}>
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Text fw={700} size="lg">
            {t('validateSignature.signature._value', 'Signature')} {index + 1}
          </Text>
          <SignatureStatusBadge signature={signature} />
        </Group>
        {signature.errorMessage && (
          <Text c="red" size="sm">{signature.errorMessage}</Text>
        )}
      </Group>

      <div className="grid-container">{signatureFields}</div>

      <Divider my="sm" />

      <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.8 }}>
        {t('validateSignature.cert.details', 'Certificate Details')}
      </Text>
      <div className="grid-container">{certificateFields}</div>
    </Stack>
  );
};

export default SignatureSection;
