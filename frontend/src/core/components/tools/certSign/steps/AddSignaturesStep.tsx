import { useState } from 'react';
import { Button, Stack, Text, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import { SignatureTypeSelector, SignatureType } from '@app/components/shared/wetSignature/SignatureTypeSelector';
import { DrawSignatureCanvas } from '@app/components/shared/wetSignature/DrawSignatureCanvas';
import { UploadSignatureImage } from '@app/components/shared/wetSignature/UploadSignatureImage';
import { TypeSignatureText } from '@app/components/shared/wetSignature/TypeSignatureText';

export interface PlacedSignature {
  id: string;
  signature: string;
  type: SignatureType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AddSignaturesStepProps {
  signatureCount: number;
  onRequestPlacement: (signature: string, type: SignatureType) => void;
  onCancelPlacement?: () => void;
  placementMode: boolean;
  disabled?: boolean;
}

export const AddSignaturesStep: React.FC<AddSignaturesStepProps> = ({
  signatureCount,
  onRequestPlacement,
  onCancelPlacement,
  placementMode,
  disabled = false,
}) => {
  const { t } = useTranslation();

  // Current signature being created
  const [signatureType, setSignatureType] = useState<SignatureType>('draw');
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureText, setSignatureText] = useState('');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(40);
  const [textColor, setTextColor] = useState('#000000');

  const hasSignature =
    (signatureType === 'draw' && signature) ||
    (signatureType === 'upload' && signature) ||
    (signatureType === 'type' && signatureText && signature);

  const handlePlaceSignature = () => {
    if (signature) {
      onRequestPlacement(signature, signatureType);
    }
  };

  return (
    <Stack gap="md">
      {/* Signature Creation */}
      <Paper p="md" withBorder>
        <Text size="sm" fw={600} mb="md">
          {t('certSign.collab.signRequest.steps.createSignature', 'Create Signature')}
        </Text>

        <Stack gap="md">
          <SignatureTypeSelector
            value={signatureType}
            onChange={setSignatureType}
            disabled={disabled || placementMode}
          />

          {signatureType === 'draw' && (
            <DrawSignatureCanvas
              signature={signature}
              onChange={setSignature}
              disabled={disabled || placementMode}
            />
          )}

          {signatureType === 'upload' && (
            <UploadSignatureImage
              signature={signature}
              onChange={setSignature}
              disabled={disabled || placementMode}
            />
          )}

          {signatureType === 'type' && (
            <TypeSignatureText
              text={signatureText}
              fontFamily={fontFamily}
              fontSize={fontSize}
              color={textColor}
              onTextChange={setSignatureText}
              onFontFamilyChange={setFontFamily}
              onFontSizeChange={setFontSize}
              onColorChange={setTextColor}
              onSignatureChange={setSignature}
              disabled={disabled || placementMode}
            />
          )}

          {!placementMode ? (
            <Button
              leftSection={<AddIcon />}
              onClick={handlePlaceSignature}
              disabled={!hasSignature || disabled}
            >
              {t('certSign.collab.signRequest.steps.placeOnPdf', 'Place on PDF')}
            </Button>
          ) : (
            <Button
              leftSection={<CancelIcon />}
              onClick={onCancelPlacement}
              disabled={disabled}
              variant="light"
              color="red"
            >
              {t('certSign.collab.signRequest.steps.cancelPlacement', 'Cancel Placement')}
            </Button>
          )}
        </Stack>
      </Paper>

      {placementMode && (
        <Text size="xs" c="blue" ta="center">
          {t('certSign.collab.signRequest.steps.clickMultipleTimes', 'Click on the PDF multiple times to place signatures. Drag any signature to move or resize it.')}
        </Text>
      )}
    </Stack>
  );
};
