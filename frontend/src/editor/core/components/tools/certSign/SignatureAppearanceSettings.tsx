import { useState } from "react";
import {
  FileInput,
  Group,
  Stack,
  Text,
  TextInput,
  NumberInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  CertSignParameters,
  StampGraphic,
} from "@editor/hooks/tools/certSign/useCertSignParameters";
import type { CertSignStampPlacement } from "@editor/hooks/tools/certSign/useCertSignStampPlacement";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { Banner } from "@editor/ui/Banner";
import { Button } from "@editor/ui/Button";
import { Collapsible } from "@editor/ui/Collapsible";
import { Icon } from "@editor/ui/Icon";
import { RadioGroup } from "@editor/ui/Radio";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
  /** Field choice and on-page placement; absent where no single document is open. */
  placement?: CertSignStampPlacement;
}

const PLACE_ON_PAGE = "place";
const FIELD_PREFIX = "field:";

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  placement,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(parameters.reason || parameters.location || parameters.name),
  );

  return (
    <Stack gap="md">
      <ToggleSwitch
        checked={parameters.showSignature}
        onChange={(checked) => onParameterChange("showSignature", checked)}
        label={t("certSign.appearance.showOnPage", "Show signature on page")}
        disabled={disabled}
      />

      {parameters.showSignature && (
        <Stack gap="sm">
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
          <GraphicChoice
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
          <ToggleSwitch
            checked={parameters.showWatermark}
            onChange={(checked) => onParameterChange("showWatermark", checked)}
            label={t("certSign.appearance.graphic.watermark", "Logo watermark")}
            disabled={disabled}
          />
        </Stack>
      )}

      <Collapsible
        open={detailsOpen}
        onToggle={() => setDetailsOpen((open) => !open)}
        header={t(
          "certSign.appearance.options.optionalTitle",
          "Signature details (optional)",
        )}
      >
        <Stack gap="sm" inert={!detailsOpen}>
          <TextInput
            label={t("certSign.reason", "Reason")}
            value={parameters.reason}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("reason", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.location", "Location")}
            value={parameters.location}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("location", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.appearance.options.signerName", "Signer name")}
            placeholder={t(
              "certSign.appearance.options.signerNamePlaceholder",
              "Uses the name on the certificate",
            )}
            value={parameters.name}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("name", event.currentTarget.value)
            }
            disabled={disabled}
          />
        </Stack>
      </Collapsible>
    </Stack>
  );
};

type SectionProps = Pick<
  SignatureAppearanceSettingsProps,
  "parameters" | "onParameterChange"
> & { disabled: boolean };

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
      <RadioGroup<StampGraphic>
        name="cert-sign-graphic"
        value={parameters.stampGraphic}
        onChange={(next) => onParameterChange("stampGraphic", next)}
        options={[
          {
            value: "NAME",
            label: t("certSign.appearance.graphic.name", "Signer's name"),
            disabled,
          },
          {
            value: "IMAGE",
            label: t("certSign.appearance.graphic.image", "Image"),
            description: t(
              "certSign.appearance.graphic.imageHint",
              "A handwritten signature or seal, PNG or JPEG",
            ),
            disabled,
          },
          {
            value: "NONE",
            label: t("certSign.appearance.graphic.none", "Nothing"),
            disabled,
          },
        ]}
      />
      {parameters.stampGraphic === "IMAGE" && (
        <FileInput
          value={parameters.signatureImage ?? null}
          onChange={(file) =>
            onParameterChange("signatureImage", file ?? undefined)
          }
          accept="image/png,image/jpeg"
          placeholder={t(
            "certSign.appearance.graphic.chooseImage",
            "Choose an image",
          )}
          className={privateContentClassName}
          disabled={disabled}
          clearable
        />
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
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("certSign.appearance.placement.where", "Where to sign")}
      </Text>
      <RadioGroup
        name="cert-sign-placement"
        value={
          parameters.fieldName
            ? `${FIELD_PREFIX}${parameters.fieldName}`
            : PLACE_ON_PAGE
        }
        onChange={(value) =>
          onParameterChange(
            "fieldName",
            value === PLACE_ON_PAGE
              ? undefined
              : value.slice(FIELD_PREFIX.length),
          )
        }
        options={[
          ...fields.map((field) => ({
            value: `${FIELD_PREFIX}${field.name}`,
            label: <PrivateContent>{field.name}</PrivateContent>,
            description: t(
              "certSign.appearance.placement.fieldOnPage",
              "Signature field on page {{page}}",
              { page: field.pageIndex + 1 },
            ),
            disabled,
          })),
          {
            value: PLACE_ON_PAGE,
            label: t(
              "certSign.appearance.placement.elsewhere",
              "Somewhere else on the page",
            ),
            disabled,
          },
        ]}
      />
    </Stack>
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
      <Banner
        tone="info"
        icon={icon}
        description={t(
          "certSign.appearance.placement.clickPage",
          "Click the page where the signature should go.",
        )}
        action={
          <Button variant="secondary" size="sm" onClick={placement.remove}>
            {t("certSign.appearance.placement.cancel", "Cancel")}
          </Button>
        }
      />
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
      <Text size="xs" c="dimmed">
        {t(
          "certSign.appearance.placement.defaultCorner",
          "Not placed yet: the signature goes in the bottom-right corner of the page below.",
        )}
      </Text>
      <PageNumberInput
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />
    </Stack>
  );
};

const PageNumberInput = ({
  parameters,
  onParameterChange,
  disabled,
}: SectionProps) => {
  const { t } = useTranslation();
  return (
    <NumberInput
      label={t("certSign.pageNumber", "Page Number")}
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
