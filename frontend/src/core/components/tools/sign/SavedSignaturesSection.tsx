import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Box, Card, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { LocalIcon } from '@app/components/shared/LocalIcon';
import { SavedSignature, SavedSignatureType } from '@app/hooks/tools/sign/useSavedSignatures';
import type { StorageType } from '@app/services/signatureStorageService';

interface SavedSignaturesSectionProps {
  signatures: SavedSignature[];
  disabled?: boolean;
  isAtCapacity: boolean;
  maxLimit: number;
  storageType?: StorageType | null;
  isAdmin?: boolean;
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
  maxLimit,
  storageType: _storageType,
  isAdmin = false,
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

  // Group signatures by scope
  const groupedSignatures = useMemo(() => {
    const personal = signatures.filter(sig => sig.scope === 'personal');
    const shared = signatures.filter(sig => sig.scope === 'shared');
    const localStorage = signatures.filter(sig => sig.scope === 'localStorage');
    return { personal, shared, localStorage };
  }, [signatures]);

  // Separate carousel state for each category
  const [activePersonalIndex, setActivePersonalIndex] = useState(0);
  const [activeSharedIndex, setActiveSharedIndex] = useState(0);
  const [activeLocalStorageIndex, setActiveLocalStorageIndex] = useState(0);

  const activePersonalSignature = groupedSignatures.personal[activePersonalIndex];
  const activeSharedSignature = groupedSignatures.shared[activeSharedIndex];
  const activeLocalStorageSignature = groupedSignatures.localStorage[activeLocalStorageIndex];

  const onUseSignatureRef = useRef(onUseSignature);

  useEffect(() => {
    onUseSignatureRef.current = onUseSignature;
  }, [onUseSignature]);

  useEffect(() => {
    setLabelDrafts(prev => {
      const nextDrafts: Record<string, string> = {};
      signatures.forEach(sig => {
        nextDrafts[sig.id] = prev[sig.id] ?? sig.label ?? '';
      });
      return nextDrafts;
    });
  }, [signatures]);

  // Reset carousel indices when categories change
  useEffect(() => {
    setActivePersonalIndex(prev => Math.min(prev, Math.max(groupedSignatures.personal.length - 1, 0)));
  }, [groupedSignatures.personal.length]);

  useEffect(() => {
    setActiveSharedIndex(prev => Math.min(prev, Math.max(groupedSignatures.shared.length - 1, 0)));
  }, [groupedSignatures.shared.length]);

  useEffect(() => {
    setActiveLocalStorageIndex(prev => Math.min(prev, Math.max(groupedSignatures.localStorage.length - 1, 0)));
  }, [groupedSignatures.localStorage.length]);

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
            { max: maxLimit }
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
              max: maxLimit,
            })}
          </Text>
        </Alert>
      )}

      {signatures.length === 0 ? (
        emptyState
      ) : (
        <Stack gap="md">
          {/* Personal Signatures */}
          {groupedSignatures.personal.length > 0 && activePersonalSignature && (
            <Stack gap="xs">
              <Group gap="xs">
                <LocalIcon icon="material-symbols:person-rounded" width={18} height={18} />
                <Text fw={600} size="sm">
                  {translate('saved.personalHeading', 'Personal Signatures')}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {translate('saved.personalDescription', 'Only you can see these signatures.')}
              </Text>

              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                  {translate('saved.carouselPosition', '{{current}} of {{total}}', {
                    current: activePersonalIndex + 1,
                    total: groupedSignatures.personal.length,
                  })}
                </Text>
                <Group gap={4}>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.prev', 'Previous')}
                    onClick={() => setActivePersonalIndex(prev => Math.max(0, prev - 1))}
                    disabled={disabled || activePersonalIndex === 0}
                  >
                    <LocalIcon icon="material-symbols:chevron-left-rounded" width={18} height={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.next', 'Next')}
                    onClick={() => setActivePersonalIndex(prev => Math.min(groupedSignatures.personal.length - 1, prev + 1))}
                    disabled={disabled || activePersonalIndex >= groupedSignatures.personal.length - 1}
                  >
                    <LocalIcon icon="material-symbols:chevron-right-rounded" width={18} height={18} />
                  </ActionIcon>
                </Group>
              </Group>

              <Card withBorder padding="sm">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Badge color={typeBadgeColor[activePersonalSignature.type]} variant="light">
                      {typeLabel(activePersonalSignature.type)}
                    </Badge>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        aria-label="Use signature"
                        onClick={() => onUseSignature(activePersonalSignature)}
                        disabled={disabled}
                      >
                        <LocalIcon icon="material-symbols:check-circle-outline-rounded" width={18} height={18} />
                      </ActionIcon>
                      <Tooltip label={translate('saved.delete', 'Remove')}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={translate('saved.delete', 'Remove')}
                          onClick={() => onDeleteSignature(activePersonalSignature)}
                          disabled={disabled}
                        >
                          <LocalIcon icon="material-symbols:delete-outline-rounded" width={18} height={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {renderPreview(activePersonalSignature)}
                  <TextInput
                    label={translate('saved.label', 'Label')}
                    value={labelDrafts[activePersonalSignature.id] ?? activePersonalSignature.label}
                    onChange={event => handleLabelChange(event, activePersonalSignature)}
                    onBlur={() => handleLabelBlur(activePersonalSignature)}
                    onKeyDown={event => handleLabelKeyDown(event, activePersonalSignature)}
                    disabled={disabled}
                  />
                </Stack>
              </Card>
            </Stack>
          )}

          {/* Shared Signatures */}
          {groupedSignatures.shared.length > 0 && activeSharedSignature && (
            <Stack gap="xs">
              <Group gap="xs">
                <LocalIcon icon="material-symbols:groups-rounded" width={18} height={18} />
                <Text fw={600} size="sm">
                  {translate('saved.sharedHeading', 'Shared Signatures')}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {translate('saved.sharedDescription', 'All users can see and use these signatures.')}
              </Text>

              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                  {translate('saved.carouselPosition', '{{current}} of {{total}}', {
                    current: activeSharedIndex + 1,
                    total: groupedSignatures.shared.length,
                  })}
                </Text>
                <Group gap={4}>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.prev', 'Previous')}
                    onClick={() => setActiveSharedIndex(prev => Math.max(0, prev - 1))}
                    disabled={disabled || activeSharedIndex === 0}
                  >
                    <LocalIcon icon="material-symbols:chevron-left-rounded" width={18} height={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.next', 'Next')}
                    onClick={() => setActiveSharedIndex(prev => Math.min(groupedSignatures.shared.length - 1, prev + 1))}
                    disabled={disabled || activeSharedIndex >= groupedSignatures.shared.length - 1}
                  >
                    <LocalIcon icon="material-symbols:chevron-right-rounded" width={18} height={18} />
                  </ActionIcon>
                </Group>
              </Group>

              <Card withBorder padding="sm">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Badge color={typeBadgeColor[activeSharedSignature.type]} variant="light">
                      {typeLabel(activeSharedSignature.type)}
                    </Badge>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        aria-label="Use signature"
                        onClick={() => onUseSignature(activeSharedSignature)}
                        disabled={disabled}
                      >
                        <LocalIcon icon="material-symbols:check-circle-outline-rounded" width={18} height={18} />
                      </ActionIcon>
                      {isAdmin && (
                        <Tooltip label={translate('saved.delete', 'Remove')}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={translate('saved.delete', 'Remove')}
                            onClick={() => onDeleteSignature(activeSharedSignature)}
                            disabled={disabled}
                          >
                            <LocalIcon icon="material-symbols:delete-outline-rounded" width={18} height={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                  {renderPreview(activeSharedSignature)}
                  <TextInput
                    label={translate('saved.label', 'Label')}
                    value={labelDrafts[activeSharedSignature.id] ?? activeSharedSignature.label}
                    onChange={event => handleLabelChange(event, activeSharedSignature)}
                    onBlur={() => handleLabelBlur(activeSharedSignature)}
                    onKeyDown={event => handleLabelKeyDown(event, activeSharedSignature)}
                    disabled={disabled}
                  />
                </Stack>
              </Card>
            </Stack>
          )}

          {/* Browser Storage (localStorage) - Temporary */}
          {groupedSignatures.localStorage.length > 0 && activeLocalStorageSignature && (
            <Stack gap="xs">
              <Alert color="blue" title={translate('saved.tempStorageTitle', 'Temporary browser storage')}>
                <Text size="xs">
                  {translate(
                    'saved.tempStorageDescription',
                    'Signatures are stored in your browser only. They will be lost if you clear browser data or switch browsers.'
                  )}
                </Text>
              </Alert>

              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                  {translate('saved.carouselPosition', '{{current}} of {{total}}', {
                    current: activeLocalStorageIndex + 1,
                    total: groupedSignatures.localStorage.length,
                  })}
                </Text>
                <Group gap={4}>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.prev', 'Previous')}
                    onClick={() => setActiveLocalStorageIndex(prev => Math.max(0, prev - 1))}
                    disabled={disabled || activeLocalStorageIndex === 0}
                  >
                    <LocalIcon icon="material-symbols:chevron-left-rounded" width={18} height={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    aria-label={translate('saved.next', 'Next')}
                    onClick={() => setActiveLocalStorageIndex(prev => Math.min(groupedSignatures.localStorage.length - 1, prev + 1))}
                    disabled={disabled || activeLocalStorageIndex >= groupedSignatures.localStorage.length - 1}
                  >
                    <LocalIcon icon="material-symbols:chevron-right-rounded" width={18} height={18} />
                  </ActionIcon>
                </Group>
              </Group>

              <Card withBorder padding="sm">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Badge color={typeBadgeColor[activeLocalStorageSignature.type]} variant="light">
                      {typeLabel(activeLocalStorageSignature.type)}
                    </Badge>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        aria-label="Use signature"
                        onClick={() => onUseSignature(activeLocalStorageSignature)}
                        disabled={disabled}
                      >
                        <LocalIcon icon="material-symbols:check-circle-outline-rounded" width={18} height={18} />
                      </ActionIcon>
                      <Tooltip label={translate('saved.delete', 'Remove')}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={translate('saved.delete', 'Remove')}
                          onClick={() => onDeleteSignature(activeLocalStorageSignature)}
                          disabled={disabled}
                        >
                          <LocalIcon icon="material-symbols:delete-outline-rounded" width={18} height={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {renderPreview(activeLocalStorageSignature)}
                  <TextInput
                    label={translate('saved.label', 'Label')}
                    value={labelDrafts[activeLocalStorageSignature.id] ?? activeLocalStorageSignature.label}
                    onChange={event => handleLabelChange(event, activeLocalStorageSignature)}
                    onBlur={() => handleLabelBlur(activeLocalStorageSignature)}
                    onKeyDown={event => handleLabelKeyDown(event, activeLocalStorageSignature)}
                    disabled={disabled}
                  />
                </Stack>
              </Card>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default SavedSignaturesSection;
