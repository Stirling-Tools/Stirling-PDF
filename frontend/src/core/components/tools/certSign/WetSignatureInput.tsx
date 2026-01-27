import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Stack,
  SegmentedControl,
  Text,
  Radio,
  FileInput,
  PasswordInput,
  Divider,
} from '@mantine/core';
import { DrawingCanvas } from '@app/components/annotation/shared/DrawingCanvas';
import { ImageUploader } from '@app/components/annotation/shared/ImageUploader';
import { TextInputWithFont } from '@app/components/annotation/shared/TextInputWithFont';
import { ColorPicker } from '@app/components/annotation/shared/ColorPicker';

type SignatureType = 'canvas' | 'image' | 'text';
type CertificateType = 'SERVER' | 'USER_CERT' | 'UPLOAD';

interface WetSignatureInputProps {
  onSignatureDataChange: (data: string | undefined) => void;
  onSignatureTypeChange: (type: SignatureType) => void;
  onCertTypeChange: (type: CertificateType) => void;
  onP12FileChange: (file: File | null) => void;
  onPasswordChange: (password: string) => void;
  certType: CertificateType;
  p12File: File | null;
  password: string;
  disabled?: boolean;
}

const WetSignatureInput = ({
  onSignatureDataChange,
  onSignatureTypeChange,
  onCertTypeChange,
  onP12FileChange,
  onPasswordChange,
  certType,
  p12File,
  password,
  disabled = false,
}: WetSignatureInputProps) => {
  const { t } = useTranslation();

  // Signature type state
  const [signatureType, setSignatureType] = useState<SignatureType>('canvas');

  // Canvas drawing state
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [penSizeInput, setPenSizeInput] = useState('2');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | undefined>();

  // Image upload state
  const [imageSignatureData, setImageSignatureData] = useState<string | undefined>();

  // Text signature state
  const [signerName, setSignerName] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [textColor, setTextColor] = useState('#000000');

  // Handle signature type change
  const handleSignatureTypeChange = useCallback(
    (type: SignatureType) => {
      setSignatureType(type);
      onSignatureTypeChange(type);

      // Update signature data based on type
      if (type === 'canvas') {
        onSignatureDataChange(canvasSignatureData);
      } else if (type === 'image') {
        onSignatureDataChange(imageSignatureData);
      } else if (type === 'text') {
        // For text signatures, we pass the signer name
        onSignatureDataChange(signerName || undefined);
      }
    },
    [canvasSignatureData, imageSignatureData, signerName, onSignatureTypeChange, onSignatureDataChange]
  );

  // Handle canvas signature change
  const handleCanvasSignatureChange = useCallback(
    (data: string | null) => {
      const nextValue = data ?? undefined;
      setCanvasSignatureData(nextValue);
      if (signatureType === 'canvas') {
        onSignatureDataChange(nextValue);
      }
    },
    [signatureType, onSignatureDataChange]
  );

  // Handle image upload
  const handleImageChange = useCallback(
    async (file: File | null) => {
      if (file && !disabled) {
        try {
          const result = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                resolve(e.target.result as string);
              } else {
                reject(new Error('Failed to read file'));
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });

          setImageSignatureData(result);
          if (signatureType === 'image') {
            onSignatureDataChange(result);
          }
        } catch (error) {
          console.error('Error reading file:', error);
        }
      } else if (!file) {
        setImageSignatureData(undefined);
        if (signatureType === 'image') {
          onSignatureDataChange(undefined);
        }
      }
    },
    [disabled, signatureType, onSignatureDataChange]
  );

  // Handle text signature changes
  useEffect(() => {
    if (signatureType === 'text') {
      onSignatureDataChange(signerName || undefined);
    }
  }, [signatureType, signerName, onSignatureDataChange]);

  const renderSignatureBuilder = () => {
    if (signatureType === 'canvas') {
      return (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('certSign.collab.signRequest.drawSignature', 'Draw your signature below')}
          </Text>
          <DrawingCanvas
            selectedColor={selectedColor}
            penSize={penSize}
            penSizeInput={penSizeInput}
            onColorSwatchClick={() => setIsColorPickerOpen(true)}
            onPenSizeChange={setPenSize}
            onPenSizeInputChange={setPenSizeInput}
            onSignatureDataChange={handleCanvasSignatureChange}
            onDrawingComplete={() => {}}
            disabled={disabled}
            initialSignatureData={canvasSignatureData}
          />
        </Stack>
      );
    }

    if (signatureType === 'image') {
      return (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('certSign.collab.signRequest.uploadSignature', 'Upload your signature image')}
          </Text>
          <ImageUploader onImageChange={handleImageChange} disabled={disabled} />
        </Stack>
      );
    }

    return (
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          {t('certSign.collab.signRequest.typeSignature', 'Type your name to create a signature')}
        </Text>
        <TextInputWithFont
          text={signerName}
          onTextChange={setSignerName}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          textColor={textColor}
          onTextColorChange={setTextColor}
          disabled={disabled}
          onAnyChange={() => {}}
        />
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      {/* Signature Type Selector */}
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t('certSign.collab.signRequest.signatureType', 'Signature Type')}
        </Text>
        <SegmentedControl
          value={signatureType}
          fullWidth
          onChange={(value) => handleSignatureTypeChange(value as SignatureType)}
          data={[
            { label: t('sign.type.canvas', 'Draw'), value: 'canvas' },
            { label: t('sign.type.image', 'Upload'), value: 'image' },
            { label: t('sign.type.text', 'Type'), value: 'text' },
          ]}
          disabled={disabled}
        />
      </Stack>

      {/* Signature Builder */}
      {renderSignatureBuilder()}

      <Divider />

      {/* Certificate Selection */}
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t('certSign.collab.signRequest.certificateChoice', 'Certificate Choice')}
        </Text>
        <Radio.Group
          value={certType}
          onChange={(value) => onCertTypeChange(value as CertificateType)}
        >
          <Stack gap="xs">
            <Radio
              value="USER_CERT"
              label={t('certSign.collab.signRequest.usePersonalCert', 'Use My Personal Certificate')}
              description={t('certSign.collab.signRequest.usePersonalCertDesc', 'Auto-generated for your account')}
              disabled={disabled}
            />
            <Radio
              value="SERVER"
              label={t('certSign.collab.signRequest.useServerCert', 'Use Organization Certificate')}
              description={t('certSign.collab.signRequest.useServerCertDesc', 'Shared organization certificate')}
              disabled={disabled}
            />
            <Radio
              value="UPLOAD"
              label={t('certSign.collab.signRequest.uploadCert', 'Upload Custom Certificate')}
              description={t('certSign.collab.signRequest.uploadCertDesc', 'Use your own PKCS12 certificate')}
              disabled={disabled}
            />
          </Stack>
        </Radio.Group>

        {certType === 'UPLOAD' && (
          <Stack gap="xs" mt="xs">
            <FileInput
              label={t('certSign.collab.signRequest.p12File', 'P12/PFX Certificate File')}
              placeholder={t('certSign.collab.signRequest.selectFile', 'Select file...')}
              accept=".p12,.pfx"
              value={p12File}
              onChange={onP12FileChange}
              size="xs"
              disabled={disabled}
            />
            <PasswordInput
              label={t('certSign.collab.signRequest.password', 'Certificate Password')}
              value={password}
              onChange={(event) => onPasswordChange(event.currentTarget.value)}
              size="xs"
              disabled={disabled}
            />
          </Stack>
        )}
      </Stack>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
        title={t('sign.canvas.colorPickerTitle', 'Choose stroke colour')}
      />
    </Stack>
  );
};

export default WetSignatureInput;
