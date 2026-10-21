import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Center, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon, type IconName } from "@app/ui/Icon";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useNonPdfConversion } from "@app/hooks/useNonPdfConversion";
import { formatFileSize } from "@app/utils/fileUtils";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

import { NonPdfConversionOptionsModal } from "@app/components/viewer/nonpdf/NonPdfConversionOptionsModal";
import "@app/components/viewer/nonpdf/NonPdfConversionPanel.css";

export type NonPdfConversionVariant = "compact" | "hero";

interface NonPdfConversionPanelProps {
  file: File;
  plan: NonPdfConversionPlan;
  variant: NonPdfConversionVariant;
  /** Conversion is disabled by the server, not by this file's format. */
  disabled?: boolean;
  onConverted?: () => void;
  onOpenInConvert?: () => void;
}

interface ConversionStatusProps {
  file: File;
  compact: boolean;
  onCancel: () => void;
  onRetry: () => void;
  optionsButton?: ReactNode;
  onOpenInConvert?: () => void;
  onDismiss: () => void;
  errorMessage: string | null;
}

function getFormatIcon(plan: NonPdfConversionPlan): IconName {
  switch (plan.optionsKind) {
    case "ebook":
      return "book-open";
    case "image":
      return "image";
    case "svg":
      return "image";
    case "web":
      return "file-html";
    case "email":
      return "mail";
    case "cbz":
    case "cbr":
      return "book-open";
    case "office":
      return "file-text";
    default:
      break;
  }

  switch (plan.extension) {
    case "csv":
    case "tsv":
      return "table";
    case "json":
      return "braces";
    case "md":
      return "code";
    default:
      return "file-text";
  }
}

function FormatIcon({
  plan,
  large = false,
}: {
  plan: NonPdfConversionPlan;
  large?: boolean;
}) {
  return (
    <Box
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: large ? "4rem" : "2.25rem",
        height: large ? "4rem" : "2.25rem",
        borderRadius: large ? "0.9rem" : "0.5rem",
        flexShrink: 0,
        color: "var(--c-accent-fg)",
        background: "var(--c-primary-subtle)",
      }}
    >
      <Icon name={getFormatIcon(plan)} size={large ? "1.75rem" : "1.15rem"} />
    </Box>
  );
}

function ConversionProgress({
  file,
  compact,
  onCancel,
}: Pick<ConversionStatusProps, "file" | "compact" | "onCancel">) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  return (
    <Stack
      gap="xs"
      mt={compact ? "sm" : 0}
      data-testid="nonpdf-conversion-progress"
      style={compact ? undefined : { width: "100%" }}
    >
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" role="status" aria-live="polite">
          <Loader size="xs" />
          <Text size={compact ? "sm" : "md"} fw={600} dir="auto">
            {t("viewer.nonPdf.convertingTitle", "Converting to PDF…")}
          </Text>
        </Group>
        <Button
          variant="quiet"
          size={isMobile ? "lg" : compact ? "sm" : "md"}
          onClick={onCancel}
          data-testid="nonpdf-conversion-cancel"
        >
          {t("viewer.nonPdf.cancel", "Cancel")}
        </Button>
      </Group>
      <Box
        className="nonpdf-progress"
        role="progressbar"
        aria-label={t(
          "viewer.nonPdf.convertingProgress",
          "Converting {{name}} to PDF",
          { name: file.name },
        )}
      >
        <Box className="nonpdf-progress__bar" />
      </Box>
      <Text size="xs" c="dimmed" ta={compact ? "start" : "center"} dir="auto">
        {t(
          "viewer.nonPdf.convertingBody",
          "Large files can take a moment. The PDF opens automatically when it is ready.",
        )}
      </Text>
    </Stack>
  );
}

function ConversionError({
  compact,
  onRetry,
  optionsButton,
  onOpenInConvert,
  onDismiss,
  errorMessage,
}: Pick<
  ConversionStatusProps,
  | "compact"
  | "onRetry"
  | "optionsButton"
  | "onOpenInConvert"
  | "onDismiss"
  | "errorMessage"
>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const retryRef = useRef<HTMLButtonElement>(null);
  const buttonSize = isMobile ? "lg" : compact ? "sm" : "md";

  // The error replaces the actions that were focused. Move focus to the first
  // recovery action so keyboard users do not land on <body>.
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <Paper
      mt={compact ? "sm" : 0}
      p="sm"
      radius="md"
      role="alert"
      data-testid="nonpdf-conversion-error"
      style={{
        width: compact ? undefined : "100%",
        background: "var(--c-danger-subtle)",
        border:
          "1px solid color-mix(in srgb, var(--c-danger) 35%, transparent)",
        textAlign: "start",
      }}
    >
      <Group align="flex-start" gap="sm" wrap="nowrap">
        <Icon
          name="circle-alert"
          size="1.1rem"
          style={{
            color: "var(--c-danger)",
            flexShrink: 0,
            marginTop: "0.1rem",
          }}
        />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} dir="auto">
            {t(
              "viewer.nonPdf.convertFailedTitle",
              "Could not convert this file",
            )}
          </Text>
          <Text size="xs" c="dimmed" dir="auto">
            {errorMessage ??
              t(
                "viewer.nonPdf.convertError",
                "The file could not be converted. Try again, or open it in the Convert tool.",
              )}
          </Text>
        </Box>
        <ActionIcon
          variant="quiet"
          size="sm"
          shape="circle"
          aria-label={t("viewer.nonPdf.dismiss", "Dismiss")}
          onClick={onDismiss}
        >
          <Icon name="x" size="1rem" />
        </ActionIcon>
      </Group>
      <Group justify="flex-end" gap="xs" mt="xs" wrap="wrap">
        <Button
          ref={retryRef}
          variant="secondary"
          size={buttonSize}
          fullWidth={isMobile}
          onClick={onRetry}
          data-testid="nonpdf-conversion-retry"
        >
          {t("viewer.nonPdf.retry", "Try again")}
        </Button>
        {optionsButton}
        {onOpenInConvert && (
          <Button
            variant="quiet"
            size={buttonSize}
            fullWidth={isMobile}
            onClick={onOpenInConvert}
            data-testid="nonpdf-conversion-open-convert"
          >
            {t("viewer.nonPdf.openInConvert", "Open in Convert")}
          </Button>
        )}
      </Group>
      {onOpenInConvert && (
        <Text size="xs" c="dimmed" mt={6} dir="auto">
          {t(
            "viewer.nonPdf.openInConvertHint",
            "Uses the same server conversion with more settings.",
          )}
        </Text>
      )}
    </Paper>
  );
}

export function NonPdfConversionPanel({
  file,
  plan,
  variant,
  disabled = false,
  onConverted,
  onOpenInConvert,
}: NonPdfConversionPanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const convertRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const {
    status,
    errorMessage,
    parameters,
    applyParameters,
    convert,
    cancel,
    dismissError,
  } = useNonPdfConversion({ file, plan, onConverted });

  const converting = status === "converting";
  const failed = status === "error";
  const hasOptions = plan.optionsKind !== "none";
  const formatName = plan.formatLabel;

  const openOptions = () => setOptionsOpen(true);

  const closeOptions = () => {
    setOptionsOpen(false);
    requestAnimationFrame(() => optionsRef.current?.focus());
  };

  const handleCancel = () => {
    cancel();
    requestAnimationFrame(() => convertRef.current?.focus());
  };

  const handleOptionsConvert = (next: typeof parameters) => {
    applyParameters(next);
    setOptionsOpen(false);
    void convert(next);
  };

  const handleOpenInConvert = () => {
    dismissError();
    onOpenInConvert?.();
  };

  const actionSize =
    variant === "hero" ? (isMobile ? "xl" : "md") : isMobile ? "lg" : "sm";

  const optionsButton = hasOptions ? (
    <Button
      ref={optionsRef}
      variant="secondary"
      size={actionSize}
      fullWidth={isMobile && variant === "hero"}
      leftSection={<Icon name="sliders-horizontal" size="1rem" />}
      onClick={openOptions}
      disabled={disabled || converting}
      data-testid="nonpdf-convert-options"
      aria-label={t("viewer.nonPdf.optionsTitle", "Conversion options")}
    >
      {isMobile && variant === "compact"
        ? null
        : failed
          ? t("viewer.nonPdf.adjustOptions", "Adjust options")
          : t("viewer.nonPdf.optionsTitle", "Conversion options")}
    </Button>
  ) : null;

  const convertButton = (
    <Button
      ref={convertRef}
      size={actionSize}
      fullWidth={isMobile && variant === "hero"}
      leftSection={<Icon name="file-pdf" size="1rem" />}
      onClick={() => void convert()}
      loading={converting}
      disabled={disabled || failed}
      data-testid="nonpdf-convert"
    >
      {isMobile && variant === "compact"
        ? t("viewer.nonPdf.convertShort", "To PDF")
        : t("viewer.nonPdf.convertToPdf", "Convert to PDF")}
    </Button>
  );

  // Mount only while open so draft settings start from the committed values
  // every time, and Cancel can discard them by unmounting.
  const optionsModal = optionsOpen ? (
    <NonPdfConversionOptionsModal
      open
      onClose={closeOptions}
      file={file}
      plan={plan}
      parameters={parameters}
      onConvert={handleOptionsConvert}
      converting={converting}
    />
  ) : null;

  if (variant === "hero") {
    return (
      <Center
        style={{
          flex: 1,
          overflow: "auto",
          padding: "clamp(1rem, 4vw, 2.5rem)",
        }}
        data-testid="nonpdf-hero"
      >
        <Paper
          withBorder
          radius="lg"
          p={isMobile ? "lg" : "xl"}
          style={{
            width: "100%",
            maxWidth: "34rem",
            background: "var(--c-surface)",
            boxShadow: "var(--mantine-shadow-sm)",
          }}
        >
          <Stack align="center" gap="lg">
            <FormatIcon plan={plan} large />

            <Stack align="center" gap={6} w="100%">
              <Text
                size="sm"
                fw={600}
                ta="center"
                dir="auto"
                lineClamp={2}
                style={{ maxWidth: "100%", overflowWrap: "anywhere" }}
              >
                {file.name}
              </Text>
              <Text
                size="xs"
                fw={700}
                tt="uppercase"
                c="dimmed"
                dir="auto"
                style={{ letterSpacing: "0.08em" }}
              >
                {formatName}
                {file.size > 0 ? ` · ${formatFileSize(file.size)}` : ""}
              </Text>
              <Text
                component="h2"
                ta="center"
                fw={700}
                dir="auto"
                style={{ fontSize: "1.35rem", lineHeight: 1.25 }}
              >
                {t("viewer.nonPdf.heroTitle", "Open as PDF")}
              </Text>
              <Text size="sm" c="dimmed" ta="center" dir="auto">
                {t(
                  "viewer.nonPdf.heroBody",
                  "Convert this {{format}} to preview and edit it. Your original stays in the workspace.",
                  { format: formatName },
                )}
              </Text>
            </Stack>

            {disabled ? (
              <Text size="sm" c="dimmed" ta="center" dir="auto">
                {t(
                  "viewer.nonPdf.convertDisabled",
                  "Conversion is turned off on this server. Ask your administrator to enable the Convert tool.",
                )}
              </Text>
            ) : converting ? (
              <ConversionProgress
                file={file}
                compact={false}
                onCancel={handleCancel}
              />
            ) : failed ? (
              <ConversionError
                compact={false}
                onRetry={() => void convert()}
                optionsButton={optionsButton}
                onOpenInConvert={handleOpenInConvert}
                onDismiss={dismissError}
                errorMessage={errorMessage}
              />
            ) : isMobile ? (
              <Stack gap="sm" w="100%">
                {convertButton}
                {optionsButton}
              </Stack>
            ) : (
              <Group gap="sm" justify="center">
                {convertButton}
                {optionsButton}
              </Group>
            )}
          </Stack>
        </Paper>

        {optionsModal}
      </Center>
    );
  }

  return (
    <Paper
      component="section"
      radius={0}
      p={isMobile ? "xs" : "sm"}
      aria-label={t("viewer.nonPdf.conversionBarLabel", "Convert this file")}
      data-testid="nonpdf-conversion-bar"
      style={{
        flexShrink: 0,
        background: "var(--c-bg-raised)",
        borderBottom: "1px solid var(--c-border)",
      }}
    >
      <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <FormatIcon plan={plan} />
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate dir="auto">
              {file.name}
            </Text>
            {!isMobile && (
              <Text size="xs" c="dimmed" truncate dir="auto">
                {t(
                  "viewer.nonPdf.previewSubtitle",
                  "{{format}} preview · Convert to edit, sign, or combine it.",
                  { format: formatName },
                )}
              </Text>
            )}
          </Box>
        </Group>

        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          {disabled ? (
            <Text size="xs" c="dimmed" dir="auto">
              {t(
                "viewer.nonPdf.convertDisabledShort",
                "Conversion is off on this server",
              )}
            </Text>
          ) : (
            <>
              {!converting && optionsButton}
              {!failed && convertButton}
            </>
          )}
        </Group>
      </Group>

      {converting && (
        <ConversionProgress file={file} compact onCancel={handleCancel} />
      )}
      {failed && (
        <ConversionError
          compact
          onRetry={() => void convert()}
          optionsButton={null}
          onOpenInConvert={handleOpenInConvert}
          onDismiss={dismissError}
          errorMessage={errorMessage}
        />
      )}

      {optionsModal}
    </Paper>
  );
}
