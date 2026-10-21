import { Box, Divider, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { Button } from "@app/ui/Button";
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
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  onConvert: () => void;
  converting: boolean;
}

function FormatTile({ label, pdf = false }: { label: string; pdf?: boolean }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Box
        aria-hidden
        style={{
          display: "grid",
          placeItems: "center",
          width: "2.25rem",
          height: "2.25rem",
          borderRadius: "0.5rem",
          color: pdf ? "var(--c-text-on-danger)" : "var(--c-accent-fg)",
          background: pdf ? "var(--c-danger)" : "var(--c-primary-subtle)",
        }}
      >
        <Icon name={pdf ? "file-pdf" : "file-text"} size="1.15rem" />
      </Box>
      <Text size="sm" fw={600}>
        {label}
      </Text>
    </Group>
  );
}

export function NonPdfConversionOptionsModal({
  open,
  onClose,
  file,
  plan,
  parameters,
  onParameterChange,
  onConvert,
  converting,
}: NonPdfConversionOptionsModalProps) {
  const { t } = useTranslation();

  const settings = (() => {
    const shared = {
      parameters,
      onParameterChange,
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
          <Button variant="tertiary" onClick={onClose} disabled={converting}>
            {t("viewer.nonPdf.cancel", "Cancel")}
          </Button>
          <Button
            leftSection={<Icon name="file-pdf" size="1rem" />}
            onClick={() => {
              onConvert();
              onClose();
            }}
            loading={converting}
            data-testid="nonpdf-options-convert"
          >
            {t("viewer.nonPdf.convertToPdf", "Convert to PDF")}
          </Button>
        </Group>
      }
    >
      <Stack gap="md" data-testid="nonpdf-options">
        <Paper
          p="sm"
          radius="md"
          style={{ background: "var(--c-surface-sunken)" }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <FormatTile label={plan.formatLabel} />
            <Icon
              name="arrow-right"
              size="1rem"
              style={{ color: "var(--c-text-subtle)", flexShrink: 0 }}
            />
            <FormatTile label="PDF" pdf />
          </Group>
        </Paper>

        <Divider />

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
