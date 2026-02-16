import { Button, Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SignatureTypeSelector, SignatureType } from '@app/components/shared/wetSignature/SignatureTypeSelector';
import { DrawSignatureCanvas } from '@app/components/shared/wetSignature/DrawSignatureCanvas';
import { UploadSignatureImage } from '@app/components/shared/wetSignature/UploadSignatureImage';
import { TypeSignatureText } from '@app/components/shared/wetSignature/TypeSignatureText';

interface SignatureCreationStepProps {
  signatureType: SignatureType;
  onSignatureTypeChange: (type: SignatureType) => void;
  signature: string | null;
  onSignatureChange: (signature: string | null) => void;
  // For type signature
  signatureText: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  onSignatureTextChange: (text: string) => void;
  onFontFamilyChange: (font: string) => void;
  onFontSizeChange: (size: number) => void;
  onTextColorChange: (color: string) => void;
  onNext: () => void;
  disabled?: boolean;
}

export const SignatureCreationStep: React.FC<SignatureCreationStepProps> = ({
  signatureType,
  onSignatureTypeChange,
  signature,
  onSignatureChange,
  signatureText,
  fontFamily,
  fontSize,
  textColor,
  onSignatureTextChange,
  onFontFamilyChange,
  onFontSizeChange,
  onTextColorChange,
  onNext,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const hasSignature =
    (signatureType === 'draw' && signature) ||
    (signatureType === 'upload' && signature) ||
    (signatureType === 'type' && signatureText && signature);

  return (
    <Stack gap="md">
      <SignatureTypeSelector
        value={signatureType}
        onChange={onSignatureTypeChange}
        disabled={disabled}
      />

      {signatureType === 'draw' && (
        <DrawSignatureCanvas
          signature={signature}
          onChange={onSignatureChange}
          disabled={disabled}
        />
      )}

      {signatureType === 'upload' && (
        <UploadSignatureImage
          signature={signature}
          onChange={onSignatureChange}
          disabled={disabled}
        />
      )}

      {signatureType === 'type' && (
        <TypeSignatureText
          text={signatureText}
          fontFamily={fontFamily}
          fontSize={fontSize}
          color={textColor}
          onTextChange={onSignatureTextChange}
          onFontFamilyChange={onFontFamilyChange}
          onFontSizeChange={onFontSizeChange}
          onColorChange={onTextColorChange}
          onSignatureChange={onSignatureChange}
          disabled={disabled}
        />
      )}

      <Button onClick={onNext} disabled={!hasSignature || disabled} fullWidth>
        {t('certSign.collab.signRequest.steps.continue', 'Continue to Certificate Selection')}
      </Button>
    </Stack>
  );
};
