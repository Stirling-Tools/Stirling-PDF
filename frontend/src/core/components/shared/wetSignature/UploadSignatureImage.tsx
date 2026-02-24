import { useState, useRef } from 'react';
import { Stack, Button, Text, Image } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';

interface UploadSignatureImageProps {
  signature: string | null;
  onChange: (signature: string | null) => void;
  disabled?: boolean;
}

export const UploadSignatureImage: React.FC<UploadSignatureImageProps> = ({
  signature,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError(t('certSign.collab.signRequest.invalidFileType', 'Please select an image file'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError(t('certSign.collab.signRequest.fileTooLarge', 'File size must be less than 5MB'));
      return;
    }

    setError(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      onChange(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    onChange(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('certSign.collab.signRequest.uploadSignature', 'Upload your signature image')}
      </Text>

      {signature ? (
        <Stack gap="sm">
          <div
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-default)',
              padding: '16px',
              backgroundColor: 'var(--mantine-color-default-hover)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '150px',
            }}
          >
            <Image
              src={signature}
              alt="Signature"
              fit="contain"
              style={{ maxHeight: '150px', maxWidth: '100%' }}
            />
          </div>

          <Button
            variant="light"
            color="red"
            leftSection={<DeleteIcon sx={{ fontSize: 16 }} />}
            onClick={handleClear}
            disabled={disabled}
            fullWidth
          >
            {t('certSign.collab.signRequest.removeImage', 'Remove Image')}
          </Button>
        </Stack>
      ) : (
        <Button
          variant="outline"
          leftSection={<UploadFileIcon sx={{ fontSize: 16 }} />}
          onClick={handleUploadClick}
          disabled={disabled}
          fullWidth
        >
          {t('certSign.collab.signRequest.selectFile', 'Select Image File')}
        </Button>
      )}

      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={disabled}
      />
    </Stack>
  );
};
