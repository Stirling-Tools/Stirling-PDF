import { Stack, TextInput, Select, ColorPicker, Slider, Text, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { useSystemFonts } from '@app/hooks/useSystemFonts';
import RefreshIcon from '@mui/icons-material/Refresh';

interface TypeSignatureTextProps {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  onTextChange: (text: string) => void;
  onFontFamilyChange: (fontFamily: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onColorChange: (color: string) => void;
  onSignatureChange: (signature: string | null) => void;
  disabled?: boolean;
}

export const TypeSignatureText: React.FC<TypeSignatureTextProps> = ({
  text,
  fontFamily,
  fontSize,
  color,
  onTextChange,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
  onSignatureChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { fontOptions, isLoading, error, refetch, fontCount } = useSystemFonts();

  // Generate signature image when text/style changes
  useEffect(() => {
    if (!text || !canvasRef.current) {
      onSignatureChange(null);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, (canvas.width - textWidth) / 2, canvas.height / 2);
    const dataUrl = canvas.toDataURL('image/png');
    onSignatureChange(dataUrl);
  }, [text, fontFamily, fontSize, color, onSignatureChange]);

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('certSign.collab.signRequest.typeSignature', 'Type your name to create a signature')}
      </Text>
      <TextInput
        label={t('certSign.collab.signRequest.signatureText', 'Signature Text')}
        placeholder={t('certSign.collab.signRequest.signatureTextPlaceholder', 'Enter your name...')}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
      />
      <Select
        label={t('certSign.collab.signRequest.fontFamily', 'Font Family')}
        value={fontFamily}
        onChange={(val) => val && onFontFamilyChange(val)}
        data={fontOptions}
        searchable
        disabled={disabled || isLoading}
        placeholder={isLoading ? t('common.loading', 'Loading fonts...') : 'Select font'}
      />
      <Group justify="space-between" align="flex-start">
        <div style={{ flex: 1 }}>
          {fontCount > 5 && (
            <Text size="xs" c="green">
              ✅ {fontCount} system fonts loaded
            </Text>
          )}
          {fontCount <= 5 && !isLoading && (
            <Text size="xs" c="orange">
              ⚠️ Only {fontCount} fonts found (using defaults)
            </Text>
          )}
          {error && (
            <Text size="xs" c="orange">
              {t('common.warning', 'Warning')}: {error}
            </Text>
          )}
        </div>
        {fontCount <= 5 && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => refetch()}
            disabled={isLoading}
            leftSection={<RefreshIcon sx={{ fontSize: '1rem' }} />}
          >
            Refresh
          </Button>
        )}
      </Group>
      <div>
        <Text size="sm" mb={4}>
          {t('certSign.collab.signRequest.fontSize', 'Font Size: {{size}}px', { size: fontSize })}
        </Text>
        <Slider value={fontSize} onChange={onFontSizeChange} min={20} max={80} step={2} disabled={disabled}
          marks={[{ value: 20, label: '20' }, { value: 50, label: '50' }, { value: 80, label: '80' }]}
        />
      </div>
      <div>
        <Text size="sm" mb={4}>{t('certSign.collab.signRequest.textColor', 'Text Color')}</Text>
        <ColorPicker value={color} onChange={onColorChange} format="hex" />
      </div>
      {text && (
        <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-default)', padding: '16px', backgroundColor: 'white', minHeight: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily, fontSize: `${fontSize}px`, color }}>{text}</Text>
        </div>
      )}
      <canvas ref={canvasRef} width={400} height={150} style={{ display: 'none' }} />
    </Stack>
  );
};