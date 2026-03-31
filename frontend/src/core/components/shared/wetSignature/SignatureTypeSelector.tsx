import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export type SignatureType = 'draw' | 'upload' | 'type';

interface SignatureTypeSelectorProps {
  value: SignatureType;
  onChange: (value: SignatureType) => void;
  disabled?: boolean;
}

export const SignatureTypeSelector: React.FC<SignatureTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      value={value}
      onChange={(val) => onChange(val as SignatureType)}
      disabled={disabled}
      data={[
        {
          value: 'draw',
          label: t('certSign.collab.signRequest.signatureType.draw', 'Draw'),
        },
        {
          value: 'upload',
          label: t('certSign.collab.signRequest.signatureType.upload', 'Upload'),
        },
        {
          value: 'type',
          label: t('certSign.collab.signRequest.signatureType.type', 'Type'),
        },
      ]}
      fullWidth
    />
  );
};
