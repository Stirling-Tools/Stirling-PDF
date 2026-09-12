import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Box,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import {
  SavedSignature,
  SavedSignatureType,
} from "@app/hooks/tools/sign/useSavedSignatures";
import type { StorageType } from "@app/services/signatureStorageService";

interface SavedSignaturesSectionProps {
  signatures: SavedSignature[];
  disabled?: boolean;
  isAtCapacity: boolean;
  maxLimit: number;
  storageType?: StorageType | null;
  isAdmin?: boolean;
  onUseSignature: (signature: SavedSignature) => void | Promise<void>;
  onDeleteSignature: (signature: SavedSignature) => void | Promise<void>;
  onRenameSignature: (id: string, label: string) => void;
  translationScope?: string;
}

const typeBadgeColor: Record<SavedSignatureType, string> = {
  canvas: "indigo",
  image: "teal",
  text: "grape",
};

// How long the "Selected ✓" confirmation stays on the Use button after a click.
const USE_FEEDBACK_DURATION = 1500;

type TranslateFn = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
) => string;

const renderPreview = (signature: SavedSignature) => {
  if (signature.type === "text") {
    return (
      <Box
        component="div"
        style={{
          fontFamily: signature.fontFamily,
          fontSize: `${signature.fontSize}px`,
          color: signature.textColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "120px",
          borderRadius: "0.5rem",
          backgroundColor: "#ffffff",
          padding: "0.5rem",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <Text
          size="lg"
          style={{
            fontFamily: signature.fontFamily,
            color: signature.textColor,
            whiteSpace: "nowrap",
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
        backgroundColor: "#ffffff",
        borderRadius: "0.5rem",
        height: "120px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.5rem",
      }}
    >
      <Box
        component="img"
        src={signature.dataUrl}
        alt={signature.label}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
      />
    </Box>
  );
};

const typeLabel = (type: SavedSignatureType, translate: TranslateFn) => {
  switch (type) {
    case "canvas":
      return translate("saved.type.canvas", "Drawing");
    case "image":
      return translate("saved.type.image", "Upload");
    case "text":
      return translate("saved.type.text", "Text");
    default:
      return type;
  }
};

interface SignatureCategoryProps {
  header: ReactNode;
  signatures: SavedSignature[];
  disabled: boolean;
  allowDelete: boolean;
  translate: TranslateFn;
  onUseSignature: (signature: SavedSignature) => void | Promise<void>;
  onDeleteSignature: (signature: SavedSignature) => void | Promise<void>;
  onRenameSignature: (id: string, label: string) => void;
}

// A single category (personal / shared / browser-storage) carousel. Owns its
// carousel index, per-signature label drafts, and the transient in-flight
// feedback that stops users re-clicking the icon-only Use/Remove controls.
const SignatureCategory = ({
  header,
  signatures,
  disabled,
  allowDelete,
  translate,
  onUseSignature,
  onDeleteSignature,
  onRenameSignature,
}: SignatureCategoryProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [justUsedId, setJustUsedId] = useState<string | null>(null);
  const useFeedbackTimer = useRef<number | null>(null);

  const total = signatures.length;
  const canCycle = total > 1;

  // Keep the active index in range as signatures are added/removed.
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(total - 1, 0)));
  }, [total]);

  useEffect(() => {
    setLabelDrafts((prev) => {
      const nextDrafts: Record<string, string> = {};
      signatures.forEach((sig) => {
        nextDrafts[sig.id] = prev[sig.id] ?? sig.label ?? "";
      });
      return nextDrafts;
    });
  }, [signatures]);

  useEffect(
    () => () => {
      if (useFeedbackTimer.current !== null) {
        window.clearTimeout(useFeedbackTimer.current);
      }
    },
    [],
  );

  const active = signatures[activeIndex];

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  const handleUse = useCallback(
    async (signature: SavedSignature) => {
      // Immediate, visible confirmation so the icon-only control doesn't feel dead.
      if (useFeedbackTimer.current !== null) {
        window.clearTimeout(useFeedbackTimer.current);
      }
      setJustUsedId(signature.id);
      useFeedbackTimer.current = window.setTimeout(() => {
        setJustUsedId((current) => (current === signature.id ? null : current));
        useFeedbackTimer.current = null;
      }, USE_FEEDBACK_DURATION);

      try {
        await onUseSignature(signature);
      } catch (error) {
        console.error("[SavedSignatures] Failed to use signature:", error);
      }
    },
    [onUseSignature],
  );

  const handleDelete = useCallback(
    async (signature: SavedSignature) => {
      // Guard against the rapid re-clicks that were firing several delete
      // requests for the same signature; show a spinner while it resolves.
      if (deletingId) {
        return;
      }
      setDeletingId(signature.id);
      try {
        await onDeleteSignature(signature);
      } catch (error) {
        console.error("[SavedSignatures] Failed to delete signature:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, onDeleteSignature],
  );

  const handleLabelChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    signature: SavedSignature,
  ) => {
    const { value } = event.currentTarget;
    setLabelDrafts((prev) => ({ ...prev, [signature.id]: value }));
  };

  const handleLabelBlur = (signature: SavedSignature) => {
    const nextValue = labelDrafts[signature.id]?.trim() ?? "";
    if (!nextValue || nextValue === signature.label) {
      setLabelDrafts((prev) => ({ ...prev, [signature.id]: signature.label }));
      return;
    }
    onRenameSignature(signature.id, nextValue);
  };

  const handleLabelKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    signature: SavedSignature,
  ) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setLabelDrafts((prev) => ({ ...prev, [signature.id]: signature.label }));
      event.currentTarget.blur();
    }
  };

  if (!active) {
    return null;
  }

  const isDeleting = deletingId === active.id;
  const isJustUsed = justUsedId === active.id;
  const controlsDisabled = disabled || Boolean(deletingId);

  return (
    <Stack gap="xs">
      {header}

      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          {translate("saved.carouselPosition", "{{current}} of {{total}}", {
            current: activeIndex + 1,
            total,
          })}
        </Text>
        <Group gap={4}>
          <ActionIcon
            variant="secondary"
            aria-label={translate("saved.prev", "Previous")}
            onClick={goPrev}
            disabled={controlsDisabled || !canCycle}
          >
            <LocalIcon icon="chevron-left-rounded" width={18} height={18} />
          </ActionIcon>
          <ActionIcon
            variant="secondary"
            aria-label={translate("saved.next", "Next")}
            onClick={goNext}
            disabled={controlsDisabled || !canCycle}
          >
            <LocalIcon icon="chevron-right-rounded" width={18} height={18} />
          </ActionIcon>
        </Group>
      </Group>

      <Card withBorder padding="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Badge color={typeBadgeColor[active.type]} variant="light">
              {typeLabel(active.type, translate)}
            </Badge>
            <Group gap="xs">
              <Tooltip
                label={
                  isJustUsed
                    ? translate(
                        "saved.used",
                        "Selected — click the PDF to place it",
                      )
                    : translate("saved.use", "Use signature")
                }
              >
                <ActionIcon
                  variant="tertiary"
                  accent={isJustUsed ? "success" : undefined}
                  aria-label={translate("saved.use", "Use signature")}
                  onClick={() => handleUse(active)}
                  disabled={controlsDisabled}
                >
                  <LocalIcon
                    icon={
                      isJustUsed
                        ? "check-circle-rounded"
                        : "check-circle-outline-rounded"
                    }
                    width={18}
                    height={18}
                  />
                </ActionIcon>
              </Tooltip>
              {allowDelete && (
                <Tooltip label={translate("saved.delete", "Remove")}>
                  <ActionIcon
                    variant="tertiary"
                    accent="danger"
                    aria-label={translate("saved.delete", "Remove")}
                    loading={isDeleting}
                    onClick={() => handleDelete(active)}
                    disabled={controlsDisabled}
                  >
                    <LocalIcon
                      icon="delete-outline-rounded"
                      width={18}
                      height={18}
                    />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
          {renderPreview(active)}
          <TextInput
            label={translate("saved.label", "Label")}
            value={labelDrafts[active.id] ?? active.label}
            onChange={(event) => handleLabelChange(event, active)}
            onBlur={() => handleLabelBlur(active)}
            onKeyDown={(event) => handleLabelKeyDown(event, active)}
            disabled={disabled}
          />
        </Stack>
      </Card>
    </Stack>
  );
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
  translationScope = "sign",
}: SavedSignaturesSectionProps) => {
  const { t } = useTranslation();
  const translate = useCallback<TranslateFn>(
    (key, defaultValue, options) =>
      t(`${translationScope}.${key}`, { defaultValue, ...options }),
    [t, translationScope],
  );

  // Group signatures by scope
  const groupedSignatures = useMemo(() => {
    const personal = signatures.filter((sig) => sig.scope === "personal");
    const shared = signatures.filter((sig) => sig.scope === "shared");
    const localStorage = signatures.filter(
      (sig) => sig.scope === "localStorage",
    );
    return { personal, shared, localStorage };
  }, [signatures]);

  const emptyState = (
    <Card withBorder>
      <Stack gap="xs">
        <Text fw={500}>
          {translate("saved.emptyTitle", "No saved signatures yet")}
        </Text>
        <Text size="sm" c="dimmed">
          {translate(
            "saved.emptyDescription",
            'Draw, upload, or type a signature above, then use "Save to library" to keep up to {{max}} favourites ready to use.',
            { max: maxLimit },
          )}
        </Text>
      </Stack>
    </Card>
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={0}>
          <Text fw={600} size="md">
            {translate("saved.heading", "Saved signatures")}
          </Text>
          <Text size="sm" c="dimmed">
            {translate(
              "saved.description",
              "Reuse saved signatures at any time.",
            )}
          </Text>
        </Stack>
      </Group>

      {isAtCapacity && (
        <Alert
          color="yellow"
          title={translate("saved.limitTitle", "Limit reached")}
        >
          <Text size="sm">
            {translate(
              "saved.limitDescription",
              "Remove a saved signature before adding new ones (max {{max}}).",
              {
                max: maxLimit,
              },
            )}
          </Text>
        </Alert>
      )}

      {signatures.length === 0 ? (
        emptyState
      ) : (
        <Stack gap="md">
          {/* Personal Signatures */}
          {groupedSignatures.personal.length > 0 && (
            <SignatureCategory
              header={
                <>
                  <Group gap="xs">
                    <LocalIcon icon="person-rounded" width={18} height={18} />
                    <Text fw={600} size="sm">
                      {translate(
                        "saved.personalHeading",
                        "Personal Signatures",
                      )}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {translate(
                      "saved.personalDescription",
                      "Only you can see these signatures.",
                    )}
                  </Text>
                </>
              }
              signatures={groupedSignatures.personal}
              disabled={disabled}
              allowDelete
              translate={translate}
              onUseSignature={onUseSignature}
              onDeleteSignature={onDeleteSignature}
              onRenameSignature={onRenameSignature}
            />
          )}

          {/* Shared Signatures */}
          {groupedSignatures.shared.length > 0 && (
            <SignatureCategory
              header={
                <>
                  <Group gap="xs">
                    <LocalIcon icon="groups-rounded" width={18} height={18} />
                    <Text fw={600} size="sm">
                      {translate("saved.sharedHeading", "Shared Signatures")}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {translate(
                      "saved.sharedDescription",
                      "All users can see and use these signatures.",
                    )}
                  </Text>
                </>
              }
              signatures={groupedSignatures.shared}
              disabled={disabled}
              allowDelete={isAdmin}
              translate={translate}
              onUseSignature={onUseSignature}
              onDeleteSignature={onDeleteSignature}
              onRenameSignature={onRenameSignature}
            />
          )}

          {/* Browser Storage (localStorage) - Temporary */}
          {groupedSignatures.localStorage.length > 0 && (
            <SignatureCategory
              header={
                <Alert
                  color="blue"
                  title={translate(
                    "saved.tempStorageTitle",
                    "Temporary browser storage",
                  )}
                >
                  <Text size="xs">
                    {translate(
                      "saved.tempStorageDescription",
                      "Signatures are stored in your browser only. They will be lost if you clear browser data or switch browsers.",
                    )}
                  </Text>
                </Alert>
              }
              signatures={groupedSignatures.localStorage}
              disabled={disabled}
              allowDelete
              translate={translate}
              onUseSignature={onUseSignature}
              onDeleteSignature={onDeleteSignature}
              onRenameSignature={onRenameSignature}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default SavedSignaturesSection;
