import { useState } from "react";
import { Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { Button } from "@app/ui/Button";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { Icon } from "@app/ui/Icon";
import { Modal } from "@app/ui/Modal";
import ConvertFromCbrSettings from "@app/components/tools/convert/ConvertFromCbrSettings";
import ConvertFromCbzSettings from "@app/components/tools/convert/ConvertFromCbzSettings";
import ConvertFromEbookSettings from "@app/components/tools/convert/ConvertFromEbookSettings";
import ConvertFromEmailSettings from "@app/components/tools/convert/ConvertFromEmailSettings";
import ConvertFromImageSettings from "@app/components/tools/convert/ConvertFromImageSettings";
import ConvertFromSvgSettings from "@app/components/tools/convert/ConvertFromSvgSettings";
import ConvertFromWebSettings from "@app/components/tools/convert/ConvertFromWebSettings";
import ConvertOfficeEngineSettings from "@app/components/tools/convert/ConvertOfficeEngineSettings";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

interface NonPdfConversionOptionsModalProps {
  open: boolean;
  onClose: () => void;
  file: File;
  plan: NonPdfConversionPlan;
  /** Committed parameters; the dialog edits a draft so Cancel can discard it. */
  parameters: ConvertParameters;
  onConvert: (parameters: ConvertParameters) => void;
  converting: boolean;
}

export function NonPdfConversionOptionsModal({
  open,
  onClose,
  file,
  plan,
  parameters,
  onConvert,
  converting,
}: NonPdfConversionOptionsModalProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(parameters);

  const updateDraft = <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const settings = (() => {
    const shared = {
      parameters: draft,
      onParameterChange: updateDraft,
      disabled: converting,
    };

    switch (plan.optionsKind) {
      case "image":
        return <ConvertFromImageSettings {...shared} />;
      case "svg":
        return <ConvertFromSvgSettings {...shared} />;
      case "web":
        return <ConvertFromWebSettings {...shared} />;
      case "email":
        return <ConvertFromEmailSettings {...shared} />;
      case "ebook":
        return <ConvertFromEbookSettings {...shared} />;
      case "cbz":
        return <ConvertFromCbzSettings {...shared} />;
      case "cbr":
        return <ConvertFromCbrSettings {...shared} />;
      case "office":
        return <ConvertOfficeEngineSettings {...shared} />;
      default:
        return (
          <Text size="sm" c="dimmed">
            {t(
              "viewer.nonPdf.optionsNone",
              "This format converts directly to PDF without extra settings.",
            )}
          </Text>
        );
    }
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("viewer.nonPdf.optionsTitle", "Conversion options")}
      subtitle={file.name}
      width="md"
      footer={
        <Group justify="flex-end" gap="sm">
          <Button
            variant="tertiary"
            size={isMobile ? "lg" : "md"}
            onClick={onClose}
            disabled={converting}
          >
            {t("viewer.nonPdf.cancel", "Cancel")}
          </Button>
          <Button
            size={isMobile ? "lg" : "md"}
            leftSection={<Icon name="file-pdf" size="1rem" />}
            onClick={() => onConvert(draft)}
            loading={converting}
            data-testid="nonpdf-options-convert"
          >
            {t("viewer.nonPdf.convertToPdf", "Convert to PDF")}
          </Button>
        </Group>
      }
    >
      <Stack gap="md" data-testid="nonpdf-options">
        <Text
          size="xs"
          fw={600}
          tt="uppercase"
          c="dimmed"
          style={{ letterSpacing: "0.08em" }}
        >
          {t("viewer.nonPdf.optionsSection", "PDF options")}
        </Text>

        {settings}

        <Text size="xs" c="dimmed">
          {t(
            "viewer.nonPdf.optionsKeepOriginal",
            "Your original file stays in the workspace, so you can compare or convert it again.",
          )}
        </Text>
      </Stack>
    </Modal>
  );
}
