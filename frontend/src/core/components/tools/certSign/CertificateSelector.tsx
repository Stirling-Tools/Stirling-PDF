import { Stack, Button, TextInput, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState, useRef } from 'react';

export type CertificateType = 'USER_CERT' | 'SERVER' | 'UPLOAD';

interface CertificateSelectorProps {
  certType: CertificateType;
  onCertTypeChange: (certType: CertificateType) => void;
  p12File: File | null;
  onP12FileChange: (file: File | null) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  disabled?: boolean;
}

export const CertificateSelector: React.FC<CertificateSelectorProps> = ({
  certType,
  onCertTypeChange,
  p12File,
  onP12FileChange,
  password,
  onPasswordChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.p12') && !fileName.endsWith('.pfx')) {
      setFileError(
        t('certSign.collab.signRequest.invalidCertFile', 'Please select a P12 or PFX certificate file')
      );
      return;
    }

    setFileError(null);
    onP12FileChange(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    onP12FileChange(null);
    onPasswordChange('');
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('certSign.collab.signRequest.certificateChoice', 'Select a certificate to sign with')}
      </Text>

      {/* Certificate Type Buttons */}
      <Stack gap="xs">
        <Button
          variant={certType === 'USER_CERT' ? 'filled' : 'outline'}
          onClick={() => onCertTypeChange('USER_CERT')}
          disabled={disabled}
          style={{ justifyContent: 'flex-start', height: 'auto', minHeight: '60px' }}
        >
          <div style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>
              {t('certSign.collab.signRequest.usePersonalCert', 'Personal Certificate')}
            </div>
            <div
              style={{
                fontSize: '0.85em',
                opacity: 0.8,
                marginTop: '4px',
                fontWeight: 400,
              }}
            >
              {t('certSign.collab.signRequest.usePersonalCertDesc', 'Auto-generated for your account')}
            </div>
          </div>
        </Button>

        <Button
          variant={certType === 'SERVER' ? 'filled' : 'outline'}
          onClick={() => onCertTypeChange('SERVER')}
          disabled={disabled}
          style={{ justifyContent: 'flex-start', height: 'auto', minHeight: '60px' }}
        >
          <div style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>
              {t('certSign.collab.signRequest.useServerCert', 'Organization Certificate')}
            </div>
            <div
              style={{
                fontSize: '0.85em',
                opacity: 0.8,
                marginTop: '4px',
                fontWeight: 400,
              }}
            >
              {t('certSign.collab.signRequest.useServerCertDesc', 'Shared organization certificate')}
            </div>
          </div>
        </Button>

        <Button
          variant={certType === 'UPLOAD' ? 'filled' : 'outline'}
          onClick={() => onCertTypeChange('UPLOAD')}
          disabled={disabled}
          style={{ justifyContent: 'flex-start', height: 'auto', minHeight: '60px' }}
        >
          <div style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>
              {t('certSign.collab.signRequest.uploadCert', 'Upload Custom Certificate')}
            </div>
            <div
              style={{
                fontSize: '0.85em',
                opacity: 0.8,
                marginTop: '4px',
                fontWeight: 400,
              }}
            >
              {t('certSign.collab.signRequest.uploadCertDesc', 'Use your own P12/PFX certificate')}
            </div>
          </div>
        </Button>
      </Stack>

      {/* Upload Certificate Fields (conditional) */}
      {certType === 'UPLOAD' && (
        <Stack gap="sm" mt="sm">

          {p12File ? (
            <div
              style={{
                padding: '12px',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-default)',
                backgroundColor: 'var(--mantine-color-default-hover)',
              }}
            >
              <Text size="sm" fw={600}>
                {p12File.name}
              </Text>
              <Text size="xs" c="dimmed">
                {(p12File.size / 1024).toFixed(2)} KB
              </Text>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={handleRemoveFile}
                disabled={disabled}
                mt="xs"
              >
                {t('certSign.collab.signRequest.removeCertFile', 'Remove File')}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleUploadClick} disabled={disabled}>
              {t('certSign.collab.signRequest.selectFile', 'Select P12/PFX File')}
            </Button>
          )}

          {fileError && (
            <Text size="xs" c="red">
              {fileError}
            </Text>
          )}

          {p12File && (
            <TextInput
              label={t('certSign.collab.signRequest.password', 'Certificate Password')}
              type="password"
              placeholder={t('certSign.collab.signRequest.passwordPlaceholder', 'Enter password...')}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={disabled}
            />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".p12,.pfx"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            disabled={disabled}
          />
        </Stack>
      )}
    </Stack>
  );
};
