import { useEffect, useRef, useState } from "react";
import { Group, Stack, Text, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  CertSignParameters,
  StampGraphic,
} from "@editor/hooks/tools/certSign/useCertSignParameters";
import type { CertSignStampPlacement } from "@editor/hooks/tools/certSign/useCertSignStampPlacement";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { Banner } from "@editor/ui/Banner";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";
import FileUploadButton from "@editor/components/shared/FileUploadButton";
import { Tooltip } from "@editor/ui/Tooltip";
import { SignatureFieldList } from "@editor/components/shared/signatureFields/SignatureFieldList";
import { StampPreviewFrame } from "@editor/components/shared/signatureFields/StampPreviewFrame";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
  /** Field choice and on-page placement; absent where no single document is open. */
  placement?: CertSignStampPlacement;
  /** The stamp as it will be drawn, shown above the options that change it. */
  preview?: string | null;
}

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  placement,
  preview,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();

  const details = (
    <SignatureDetails
      parameters={parameters}
      onParameterChange={onParameterChange}
      disabled={disabled}
    />
  );

  return (
    <Stack gap="md">
      <ToggleSwitch
        checked={parameters.showSignature}
        onChange={(checked) => onParameterChange("showSignature", checked)}
        label={t("certSign.appearance.showOnPage", "Show signature on page")}
        disabled={disabled}
      />

      {parameters.showSignature ? (
        <Stack gap="sm">
          {preview && (
            <StampPreviewFrame
              src={preview}
              alt={t(
                "certSign.appearance.placement.stampPreview",
                "How the signature will look",
              )}
            />
          )}
          <GraphicChoice
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
          <ToggleSwitch
            checked={parameters.showWatermark}
            onChange={(checked) => onParameterChange("showWatermark", checked)}
            label={t(
              "certSign.appearance.graphic.watermark",
              "Logo behind signature",
            )}
            disabled={disabled}
          />
          <ToggleSwitch
            checked={parameters.showCertificateDetails}
            onChange={(checked) =>
              onParameterChange("showCertificateDetails", checked)
            }
            label={t(
              "certSign.appearance.graphic.certificateDetails",
              "Certificate details",
            )}
            disabled={disabled}
          />
          {details}
          {placement && (
            <FieldChoice
              placement={placement}
              parameters={parameters}
              onParameterChange={onParameterChange}
              disabled={disabled}
            />
          )}
          {!parameters.fieldName &&
            (placement ? (
              <PlaceOnPage
                placement={placement}
                parameters={parameters}
                onParameterChange={onParameterChange}
                disabled={disabled}
              />
            ) : (
              <PageNumberInput
                parameters={parameters}
                onParameterChange={onParameterChange}
                disabled={disabled}
              />
            ))}
        </Stack>
      ) : (
        details
      )}
    </Stack>
  );
};

type SectionProps = Pick<
  SignatureAppearanceSettingsProps,
  "parameters" | "onParameterChange"
> & { disabled: boolean };

type DetailKey = "reason" | "location" | "name";

const SignatureDetails = ({
  parameters,
  onParameterChange,
  disabled,
}: SectionProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<DetailKey[]>([]);
  const [justOpened, setJustOpened] = useState<DetailKey | null>(null);
  const inputs = useRef(new Map<DetailKey, HTMLInputElement>());
  useEffect(() => {
    if (!justOpened) return;
    const input = inputs.current.get(justOpened);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
    setJustOpened(null);
  }, [justOpened]);
  const details: { key: DetailKey; label: string; placeholder?: string }[] = [
    { key: "reason", label: t("certSign.reason", "Reason") },
    { key: "location", label: t("certSign.location", "Location") },
    {
      key: "name",
      label: t("certSign.appearance.options.signerName", "Signer name"),
      placeholder: t(
        "certSign.appearance.options.signerNamePlaceholder",
        "Uses the name on the certificate",
      ),
    },
  ];
  const shown = details.filter(
    (detail) => parameters[detail.key] || opened.includes(detail.key),
  );
  const hidden = details.filter((detail) => !shown.includes(detail));
  const close = (key: DetailKey) => {
    setOpened((keys) => keys.filter((open) => open !== key));
    onParameterChange(key, "");
  };

  return (
    <Stack gap="xs">
      {shown.map((detail) => (
        <TextInput
          key={detail.key}
          label={detail.label}
          placeholder={detail.placeholder}
          value={parameters[detail.key]}
          className={privateContentClassName}
          ref={(input) => {
            if (input) inputs.current.set(detail.key, input);
            else inputs.current.delete(detail.key);
          }}
          onChange={(event) =>
            onParameterChange(detail.key, event.currentTarget.value)
          }
          disabled={disabled}
          rightSection={
            <ActionIcon
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={() => close(detail.key)}
              disabled={disabled}
              aria-label={t(
                "certSign.appearance.details.remove",
                "Remove {{detail}}",
                { detail: detail.label },
              )}
            >
              <Icon name="x" size={14} />
            </ActionIcon>
          }
        />
      ))}
      {hidden.length > 0 && (
        <Group gap="xs">
          {hidden.map((detail) => (
            <Button
              key={detail.key}
              variant="tertiary"
              size="sm"
              leftSection={<Icon name="plus" size={14} />}
              onClick={() => {
                setOpened((keys) => [...keys, detail.key]);
                setJustOpened(detail.key);
              }}
              disabled={disabled}
            >
              {detail.label}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  );
};

const GraphicChoice = ({
  parameters,
  onParameterChange,
  disabled,
}: SectionProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("certSign.appearance.graphic.title", "Beside the details")}
      </Text>
      <SegmentedControl<StampGraphic>
        fullWidth
        value={parameters.stampGraphic}
        onChange={(next) => onParameterChange("stampGraphic", next)}
        disabled={disabled}
        ariaLabel={t("certSign.appearance.graphic.title", "Beside the details")}
        options={[
          {
            value: "NAME",
            label: t("certSign.appearance.graphic.name", "Name"),
          },
          {
            value: "IMAGE",
            label: t("certSign.appearance.graphic.image", "Image"),
          },
          {
            value: "NONE",
            label: t("certSign.appearance.graphic.none", "None"),
          },
        ]}
      />
      {parameters.stampGraphic === "IMAGE" && (
        <Tooltip
          content={t(
            "certSign.appearance.graphic.imageHint",
            "A handwritten signature or seal, PNG or JPEG",
          )}
        >
          <div className={privateContentClassName}>
            <FileUploadButton
              file={parameters.signatureImage}
              onChange={(file) =>
                onParameterChange("signatureImage", file ?? undefined)
              }
              accept="image/png,image/jpeg"
              placeholder={t(
                "certSign.appearance.graphic.chooseImage",
                "Choose an image",
              )}
              disabled={disabled}
            />
          </div>
        </Tooltip>
      )}
    </Stack>
  );
};

const FieldChoice = ({
  placement,
  parameters,
  onParameterChange,
  disabled,
}: SectionProps & { placement: CertSignStampPlacement }) => {
  const { t } = useTranslation();
  const fields = placement.layout?.emptyFields ?? [];
  if (fields.length === 0) return null;

  return (
    <SignatureFieldList
      title={t("certSign.appearance.placement.where", "Where to sign")}
      fields={fields}
      selected={parameters.fieldName ?? null}
      onChange={(fieldName) =>
        onParameterChange("fieldName", fieldName ?? undefined)
      }
      allowCustomPosition
      disabled={disabled}
    />
  );
};

const PlaceOnPage = ({
  placement,
  parameters,
  onParameterChange,
  disabled,
}: SectionProps & { placement: CertSignStampPlacement }) => {
  const { t } = useTranslation();
  const icon = <Icon name="locate-fixed" size={16} />;

  if (placement.placing) {
    return (
      <Stack gap="xs">
        <Banner
          tone="info"
          icon={icon}
          description={t(
            "certSign.appearance.placement.clickPage",
            "Click the page where the signature should go.",
          )}
        />
        <Group gap="xs">
          <Button variant="secondary" size="sm" onClick={placement.remove}>
            {t("certSign.appearance.placement.cancel", "Cancel")}
          </Button>
        </Group>
      </Stack>
    );
  }

  if (placement.placedPage !== null) {
    return (
      <Stack gap="xs">
        <Banner
          tone="neutral"
          icon={icon}
          title={t(
            "certSign.appearance.placement.placedOnPage",
            "Placed on page {{page}}",
            { page: placement.placedPage },
          )}
          description={t(
            "certSign.appearance.placement.adjust",
            "Drag the box to move it, or drag a corner to resize it.",
          )}
        />
        <Group gap="xs">
          <Button
            variant="secondary"
            size="sm"
            onClick={placement.place}
            disabled={disabled}
          >
            {t("certSign.appearance.placement.placeAgain", "Place again")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={placement.remove}
            disabled={disabled}
          >
            {t("certSign.appearance.placement.useCorner", "Use default corner")}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Button
        variant="secondary"
        leftSection={icon}
        onClick={placement.place}
        disabled={disabled}
      >
        {t("certSign.appearance.placement.place", "Place on the page")}
      </Button>
      <PageNumberInput
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
        label={t(
          "certSign.appearance.placement.cornerPage",
          "Or the bottom-right corner of page",
        )}
      />
    </Stack>
  );
};

const PageNumberInput = ({
  parameters,
  onParameterChange,
  disabled,
  label,
}: SectionProps & { label?: string }) => {
  const { t } = useTranslation();
  return (
    <NumberInput
      label={label ?? t("certSign.pageNumber", "Page Number")}
      value={parameters.pageNumber}
      onChange={(value) =>
        onParameterChange("pageNumber", typeof value === "number" ? value : 1)
      }
      min={1}
      disabled={disabled}
    />
  );
};

export default SignatureAppearanceSettings;
