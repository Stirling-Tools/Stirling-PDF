import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
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
import { Icon, type IconName } from "@app/ui/Icon";
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
  onUseSignature: (signature: SavedSignature) => void;
  onDeleteSignature: (signature: SavedSignature) => void;
  onRenameSignature: (id: string, label: string) => void;
  translationScope?: string;
}

const typeBadgeColor: Record<SavedSignatureType, string> = {
  canvas: "indigo",
  image: "teal",
  text: "grape",
};

/** `t` bound to the section's translation scope, e.g. `sign.saved.heading`. */
type ScopedTranslate = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
) => string;

function typeLabel(translate: ScopedTranslate, type: SavedSignatureType) {
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
}

function SavedSignaturesHeader({ translate }: { translate: ScopedTranslate }) {
  return (
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
  );
}

interface CapacityAlertProps {
  show: boolean;
  max: number;
  translate: ScopedTranslate;
}

function CapacityAlert({ show, max, translate }: CapacityAlertProps) {
  if (!show) return null;
  return (
    <Alert
      color="yellow"
      title={translate("saved.limitTitle", "Limit reached")}
    >
      <Text size="sm">
        {translate(
          "saved.limitDescription",
          "Remove a saved signature before adding new ones (max {{max}}).",
          { max },
        )}
      </Text>
    </Alert>
  );
}

function SavedSignaturesEmpty({
  max,
  translate,
}: {
  max: number;
  translate: ScopedTranslate;
}) {
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Text fw={500}>
          {translate("saved.emptyTitle", "No saved signatures yet")}
        </Text>
        <Text size="sm" c="dimmed">
          {translate(
            "saved.emptyDescription",
            'Draw, upload, or type a signature above, then use "Save to library" to keep up to {{max}} favourites ready to use.',
            { max },
          )}
        </Text>
      </Stack>
    </Card>
  );
}

interface SignatureGroupHeadingProps {
  icon: IconName;
  title: string;
  description: string;
}

function SignatureGroupHeading({
  icon,
  title,
  description,
}: SignatureGroupHeadingProps) {
  return (
    <>
      <Group gap="xs">
        <Icon name={icon} size={18} />
        <Text fw={600} size="sm">
          {title}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {description}
      </Text>
    </>
  );
}

function TemporaryStorageNotice({ translate }: { translate: ScopedTranslate }) {
  return (
    <Alert
      color="blue"
      title={translate("saved.tempStorageTitle", "Temporary browser storage")}
    >
      <Text size="xs">
        {translate(
          "saved.tempStorageDescription",
          "Signatures are stored in your browser only. They will be lost if you clear browser data or switch browsers.",
        )}
      </Text>
    </Alert>
  );
}

interface CarouselNavProps {
  activeIndex: number;
  total: number;
  disabled: boolean;
  onActiveIndexChange: Dispatch<SetStateAction<number>>;
  translate: ScopedTranslate;
}

function CarouselNav({
  activeIndex,
  total,
  disabled,
  onActiveIndexChange,
  translate,
}: CarouselNavProps) {
  return (
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
          onClick={() => onActiveIndexChange((prev) => Math.max(0, prev - 1))}
          disabled={disabled || activeIndex === 0}
        >
          <Icon name="chevron-left" size={18} />
        </ActionIcon>
        <ActionIcon
          variant="secondary"
          aria-label={translate("saved.next", "Next")}
          onClick={() =>
            onActiveIndexChange((prev) => Math.min(total - 1, prev + 1))
          }
          disabled={disabled || activeIndex >= total - 1}
        >
          <Icon name="chevron-right" size={18} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

function SignaturePreview({ signature }: { signature: SavedSignature }) {
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
}

interface SignatureCardActionsProps {
  canDelete: boolean;
  disabled: boolean;
  translate: ScopedTranslate;
  onUse: () => void;
  onDelete: () => void;
}

function SignatureCardActions({
  canDelete,
  disabled,
  translate,
  onUse,
  onDelete,
}: SignatureCardActionsProps) {
  const { t } = useTranslation();
  return (
    <Group gap="xs">
      <ActionIcon
        variant="tertiary"
        aria-label={t("sign.saved.use", "Use signature")}
        onClick={onUse}
        disabled={disabled}
      >
        <Icon name="circle-check" size={18} />
      </ActionIcon>
      {canDelete && (
        <Tooltip label={translate("saved.delete", "Remove")}>
          <ActionIcon
            variant="tertiary"
            accent="danger"
            aria-label={translate("saved.delete", "Remove")}
            onClick={onDelete}
            disabled={disabled}
          >
            <Icon name="trash" size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

interface SignatureCardHandlers {
  disabled: boolean;
  translate: ScopedTranslate;
  labelDrafts: Record<string, string>;
  onUse: (signature: SavedSignature) => void;
  onDelete: (signature: SavedSignature) => void;
  onLabelChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    signature: SavedSignature,
  ) => void;
  onLabelBlur: (signature: SavedSignature) => void;
  onLabelKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    signature: SavedSignature,
  ) => void;
}

interface SavedSignatureCardProps extends SignatureCardHandlers {
  signature: SavedSignature;
  canDelete: boolean;
}

function SavedSignatureCard({
  signature,
  canDelete,
  disabled,
  translate,
  labelDrafts,
  onUse,
  onDelete,
  onLabelChange,
  onLabelBlur,
  onLabelKeyDown,
}: SavedSignatureCardProps) {
  return (
    <Card withBorder padding="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Badge color={typeBadgeColor[signature.type]} variant="light">
            {typeLabel(translate, signature.type)}
          </Badge>
          <SignatureCardActions
            canDelete={canDelete}
            disabled={disabled}
            translate={translate}
            onUse={() => onUse(signature)}
            onDelete={() => onDelete(signature)}
          />
        </Group>
        <SignaturePreview signature={signature} />
        <TextInput
          label={translate("saved.label", "Label")}
          value={labelDrafts[signature.id] ?? signature.label}
          onChange={(event) => onLabelChange(event, signature)}
          onBlur={() => onLabelBlur(signature)}
          onKeyDown={(event) => onLabelKeyDown(event, signature)}
          disabled={disabled}
        />
      </Stack>
    </Card>
  );
}

interface SignatureCarouselProps extends SignatureCardHandlers {
  signatures: SavedSignature[];
  canDelete?: boolean;
  children: ReactNode;
}

function SignatureCarousel({
  signatures,
  canDelete = true,
  children,
  ...card
}: SignatureCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep the index in range when signatures are removed.
  useEffect(() => {
    setActiveIndex((prev) =>
      Math.min(prev, Math.max(signatures.length - 1, 0)),
    );
  }, [signatures.length]);

  const active = signatures[activeIndex];
  if (signatures.length === 0 || !active) return null;
  return (
    <Stack gap="xs">
      {children}
      <CarouselNav
        activeIndex={activeIndex}
        total={signatures.length}
        disabled={card.disabled}
        onActiveIndexChange={setActiveIndex}
        translate={card.translate}
      />
      <SavedSignatureCard signature={active} canDelete={canDelete} {...card} />
    </Stack>
  );
}

interface SavedSignatureGroupsProps extends SignatureCardHandlers {
  signatures: SavedSignature[];
  isAdmin: boolean;
  maxLimit: number;
}

function SavedSignatureGroups({
  signatures,
  isAdmin,
  maxLimit,
  ...card
}: SavedSignatureGroupsProps) {
  const { translate } = card;

  // Group signatures by scope
  const groupedSignatures = useMemo(() => {
    const personal = signatures.filter((sig) => sig.scope === "personal");
    const shared = signatures.filter((sig) => sig.scope === "shared");
    const localStorage = signatures.filter(
      (sig) => sig.scope === "localStorage",
    );
    return { personal, shared, localStorage };
  }, [signatures]);

  if (signatures.length === 0) {
    return <SavedSignaturesEmpty max={maxLimit} translate={translate} />;
  }
  return (
    <Stack gap="md">
      <SignatureCarousel signatures={groupedSignatures.personal} {...card}>
        <SignatureGroupHeading
          icon="user"
          title={translate("saved.personalHeading", "Personal Signatures")}
          description={translate(
            "saved.personalDescription",
            "Only you can see these signatures.",
          )}
        />
      </SignatureCarousel>
      <SignatureCarousel
        signatures={groupedSignatures.shared}
        canDelete={isAdmin}
        {...card}
      >
        <SignatureGroupHeading
          icon="users"
          title={translate("saved.sharedHeading", "Shared Signatures")}
          description={translate(
            "saved.sharedDescription",
            "All users can see and use these signatures.",
          )}
        />
      </SignatureCarousel>
      <SignatureCarousel signatures={groupedSignatures.localStorage} {...card}>
        <TemporaryStorageNotice translate={translate} />
      </SignatureCarousel>
    </Stack>
  );
}

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
  const translate = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(`${translationScope}.${key}`, { defaultValue, ...options }),
    [t, translationScope],
  );
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const onUseSignatureRef = useRef(onUseSignature);

  useEffect(() => {
    onUseSignatureRef.current = onUseSignature;
  }, [onUseSignature]);

  useEffect(() => {
    setLabelDrafts((prev) => {
      const nextDrafts: Record<string, string> = {};
      signatures.forEach((sig) => {
        nextDrafts[sig.id] = prev[sig.id] ?? sig.label ?? "";
      });
      return nextDrafts;
    });
  }, [signatures]);

  const handleLabelBlur = (signature: SavedSignature) => {
    const nextValue = labelDrafts[signature.id]?.trim() ?? "";
    if (!nextValue || nextValue === signature.label) {
      setLabelDrafts((prev) => ({ ...prev, [signature.id]: signature.label }));
      return;
    }
    onRenameSignature(signature.id, nextValue);
  };

  const handleLabelChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    signature: SavedSignature,
  ) => {
    const { value } = event.currentTarget;
    setLabelDrafts((prev) => ({ ...prev, [signature.id]: value }));
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

  const cardHandlers: SignatureCardHandlers = {
    disabled,
    translate,
    labelDrafts,
    onUse: onUseSignature,
    onDelete: onDeleteSignature,
    onLabelChange: handleLabelChange,
    onLabelBlur: handleLabelBlur,
    onLabelKeyDown: handleLabelKeyDown,
  };

  return (
    <Stack gap="sm">
      <SavedSignaturesHeader translate={translate} />
      <CapacityAlert show={isAtCapacity} max={maxLimit} translate={translate} />
      <SavedSignatureGroups
        signatures={signatures}
        isAdmin={isAdmin}
        maxLimit={maxLimit}
        {...cardHandlers}
      />
    </Stack>
  );
};

export default SavedSignaturesSection;
