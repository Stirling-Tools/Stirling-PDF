import { Button, Stack, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { CertificateSelector, CertificateType } from '@app/components/tools/certSign/CertificateSelector';

interface CertificateSelectionStepProps {
  certType: CertificateType;
  onCertTypeChange: (certType: CertificateType) => void;
  p12File: File | null;
  onP12FileChange: (file: File | null) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export const CertificateSelectionStep: React.FC<CertificateSelectionStepProps> = ({
  certType,
  onCertTypeChange,
  p12File,
  onP12FileChange,
  password,
  onPasswordChange,
  onBack,
  onNext,
  disabled = false,
}) => {
  const { t } = useTranslation();

  // Validation: if UPLOAD type, need file and password
  const isValid =
    certType === 'USER_CERT' ||
    certType === 'SERVER' ||
    (certType === 'UPLOAD' && p12File && password);

  return (
    <Stack gap="md">
      <CertificateSelector
        certType={certType}
        onCertTypeChange={onCertTypeChange}
        p12File={p12File}
        onP12FileChange={onP12FileChange}
        password={password}
        onPasswordChange={onPasswordChange}
        disabled={disabled}
      />

      <Group gap="sm">
        <Button variant="default" onClick={onBack} leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
          {t('certSign.collab.signRequest.steps.back', 'Back')}
        </Button>
        <Button onClick={onNext} disabled={!isValid || disabled} style={{ flex: 1 }}>
          {t('certSign.collab.signRequest.steps.continueToPlacement', 'Continue to Placement')}
        </Button>
      </Group>
    </Stack>
  );
};
