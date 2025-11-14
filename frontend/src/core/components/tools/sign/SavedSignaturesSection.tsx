import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Box, Card, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { LocalIcon } from '@app/components/shared/LocalIcon';
import { MAX_SAVED_SIGNATURES, SavedSignature, SavedSignatureType } from '@app/hooks/tools/sign/useSavedSignatures';

interface SavedSignaturesSectionProps {
  signatures: SavedSignature[];
  disabled?: boolean;
  isAtCapacity: boolean;
  onUseSignature: (signature: SavedSignature) => void;
  onDeleteSignature: (signature: SavedSignature) => void;
  onRenameSignature: (id: string, label: string) => void;
  translationScope?: string;
}

const typeBadgeColor: Record<SavedSignatureType, string> = {
  canvas: 'indigo',
  image: 'teal',
  text: 'grape',
};

export const SavedSignaturesSection = ({
  signatures,
  disabled = false,
  isAtCapacity,
  onUseSignature,
  onDeleteSignature,
  onRenameSignature,
  translationScope = 'sign',
}: SavedSignaturesSectionProps) => {
  const { t } = useTranslation();
  const translate = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(`${translationScope}.${key}`, { defaultValue, ...options }),
    [t, translationScope]
  );
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSignature = signatures[activeIndex];
  const activeSignatureRef = useRef<SavedSignature | null>(activeSignature ?? null);
  const appliedSignatureIdRef = useRef<string | null>(null);
  const onUseSignatureRef = useRef(onUseSignature);

  useEffect(() => {
    onUseSignatureRef.current = onUseSignature;
  }, [onUseSignature]);

  useEffect(() => {
    activeSignatureRef.current = activeSignature ?? null;
  }, [activeSignature]);

  useEffect(() => {
    setLabelDrafts(prev => {
      const nextDrafts: Record<string, string> = {};
      signatures.forEach(sig => {
        nextDrafts[sig.id] = prev[sig.id] ?? sig.label ?? '';
      });
      return nextDrafts;
    });
  }, [signatures]);

  useEffect(() => {
    if (signatures.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(prev => Math.min(prev, Math.max(signatures.length - 1, 0)));
  }, [signatures.length]);

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      setActiveIndex(prev => {
        if (direction === 'prev') {
          return Math.max(0, prev - 1);
        }
        return Math.min(signatures.length - 1, prev + 1);
      });
    },
    [signatures.length]
  );

  const renderPreview = (signature: SavedSignature) => {
    if (signature.type === 'text') {
      return (
        <Box
          component="div"
          style={{
            fontFamily: signature.fontFamily,
            fontSize: `${signature.fontSize}px`,
            color: signature.textColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '120px',
            borderRadius: '0.5rem',
            backgroundColor: '#ffffff',
            padding: '0.5rem',
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          <Text
            size="lg"
            style={{
              fontFamily: signature.fontFamily,
              color: signature.textColor,
              whiteSpace: 'nowrap',
            }}
          >
            {signature.signerName}
          </Text>
        </Box>
      );
    }

    return (
      <Box
        component="div"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.5rem',
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.5rem',
        }}
      >
        <Box
          component="img"
          src={signature.dataUrl}
          alt={signature.label}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      </Box>
    );
  };

  const emptyState = (
    <Card withBorder>
      <Stack gap="xs">
        <Text fw={500}>{translate('saved.emptyTitle', 'No saved signatures yet')}</Text>
        <Text size="sm" c="dimmed">
          {translate(
            'saved.emptyDescription',
            'Draw, upload, or type a signature above, then use "Save to library" to keep up to {{max}} favourites ready to use.',
            { max: MAX_SAVED_SIGNATURES }
          )}
        </Text>
      </Stack>
    </Card>
  );

  const typeLabel = (type: SavedSignatureType) => {
    switch (type) {
      case 'canvas':
        return translate('saved.type.canvas', 'Drawing');
      case 'image':
        return translate('saved.type.image', 'Upload');
      case 'text':
        return translate('saved.type.text', 'Text');
      default:
        return type;
    }
  };

  const handleLabelBlur = (signature: SavedSignature) => {
    const nextValue = labelDrafts[signature.id]?.trim() ?? '';
    if (!nextValue || nextValue === signature.label) {
      setLabelDrafts(prev => ({ ...prev, [signature.id]: signature.label }));
      return;
    }
    onRenameSignature(signature.id, nextValue);
  };

  const handleLabelChange = (event: React.ChangeEvent<HTMLInputElement>, signature: SavedSignature) => {
    const { value } = event.currentTarget;
    setLabelDrafts(prev => ({ ...prev, [signature.id]: value }));
  };

  const handleLabelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, signature: SavedSignature) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      setLabelDrafts(prev => ({ ...prev, [signature.id]: signature.label }));
      event.currentTarget.blur();
    }
  };

  useEffect(() => {
    const signature = activeSignatureRef.current;
    if (!signature || disabled) {
      appliedSignatureIdRef.current = null;
      return;
    }

    if (appliedSignatureIdRef.current === signature.id) {
      return;
    }

    appliedSignatureIdRef.current = signature.id;
    onUseSignatureRef.current(signature);
  }, [activeSignature?.id, disabled]);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={0}>
          <Text fw={600} size="md">
            {translate('saved.heading', 'Saved signatures')}
          </Text>
          <Text size="sm" c="dimmed">
            {translate('saved.description', 'Reuse saved signatures at any time.')}
          </Text>
        </Stack>
      </Group>

      {isAtCapacity && (
        <Alert color="yellow" title={translate('saved.limitTitle', 'Limit reached')}>
          <Text size="sm">
            {translate('saved.limitDescription', 'Remove a saved signature before adding new ones (max {{max}}).', {
              max: MAX_SAVED_SIGNATURES,
            })}
          </Text>
        </Alert>
      )}

      {signatures.length === 0 ? (
        emptyState
      ) : (
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {translate('saved.carouselPosition', '{{current}} of {{total}}', {
                current: activeIndex + 1,
                total: signatures.length,
              })}
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="light"
                aria-label={translate('saved.prev', 'Previous')}
                onClick={() => handleNavigate('prev')}
                disabled={disabled || activeIndex === 0}
              >
                <LocalIcon icon="material-symbols:chevron-left-rounded" width={18} height={18} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                aria-label={translate('saved.next', 'Next')}
                onClick={() => handleNavigate('next')}
                disabled={disabled || activeIndex >= signatures.length - 1}
              >
                <LocalIcon icon="material-symbols:chevron-right-rounded" width={18} height={18} />
              </ActionIcon>
            </Group>
          </Group>

          {activeSignature && (
            <Card withBorder padding="sm" key={activeSignature.id}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Badge color={typeBadgeColor[activeSignature.type]} variant="light">
                    {typeLabel(activeSignature.type)}
                  </Badge>
                  <Tooltip label={translate('saved.delete', 'Remove')}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={translate('saved.delete', 'Remove')}
                      onClick={() => onDeleteSignature(activeSignature)}
                      disabled={disabled}
                    >
                      <LocalIcon icon="material-symbols:delete-outline-rounded" width={18} height={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {renderPreview(activeSignature)}

                <TextInput
                  label={translate('saved.label', 'Label')}
                  value={labelDrafts[activeSignature.id] ?? activeSignature.label}
                  onChange={event => handleLabelChange(event, activeSignature)}
                  onBlur={() => handleLabelBlur(activeSignature)}
                  onKeyDown={event => handleLabelKeyDown(event, activeSignature)}
                  disabled={disabled}
                />

              </Stack>
            </Card>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default SavedSignaturesSection;
