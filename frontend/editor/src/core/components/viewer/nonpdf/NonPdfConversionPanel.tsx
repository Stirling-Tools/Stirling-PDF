import { useEffect, useRef } from "react";
import { Box, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon, type IconName } from "@app/ui/Icon";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useNonPdfConversion } from "@app/hooks/useNonPdfConversion";
import { formatFileSize } from "@app/utils/fileUtils";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

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
        color: "var(--c-text-muted)",
        background: "var(--c-surface-sunken)",
      }}
    >
      <Icon name={getFormatIcon(plan)} size={large ? "1.75rem" : "1.15rem"} />
    </Box>
  );
}

function FileCover({ file, plan }: { file: File; plan: NonPdfConversionPlan }) {
  return (
    <div className="nonpdf-file-cover">
      <span className="nonpdf-file-cover__format">{plan.formatLabel}</span>
      <span className="nonpdf-file-cover__icon" aria-hidden>
        <Icon name={getFormatIcon(plan)} size="3.5rem" strokeWidth={1.25} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="nonpdf-file-cover__name" dir="auto">
          {file.name}
        </div>
        <div className="nonpdf-file-cover__meta" dir="auto">
          {file.size > 0 ? formatFileSize(file.size) : plan.formatLabel}
        </div>
      </div>
    </div>
  );
}

function FileRow({ file, plan }: { file: File; plan: NonPdfConversionPlan }) {
  return (
    <div className="nonpdf-file-row">
      <span className="nonpdf-file-row__icon" aria-hidden>
        <Icon name={getFormatIcon(plan)} size="1.25rem" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="nonpdf-file-row__name" dir="auto">
          {file.name}
        </div>
        <div className="nonpdf-file-row__meta" dir="auto">
          {plan.formatLabel}
          {file.size > 0 ? ` · ${formatFileSize(file.size)}` : ""}
        </div>
      </div>
    </div>
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
      <Text size="xs" c="dimmed" ta="start" dir="auto">
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
  onOpenInConvert,
  onDismiss,
  errorMessage,
}: Pick<
  ConversionStatusProps,
  "compact" | "onRetry" | "onOpenInConvert" | "onDismiss" | "errorMessage"
>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const retryRef = useRef<HTMLButtonElement>(null);
  const buttonSize = isMobile ? "lg" : "sm";

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
        background:
          "color-mix(in srgb, var(--c-danger-subtle) 42%, var(--c-surface))",
        border:
          "1px solid color-mix(in srgb, var(--c-danger) 22%, var(--c-border))",
        borderInlineStart: "3px solid var(--c-danger)",
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
      <Group justify="flex-end" gap={6} mt="xs" wrap="wrap">
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
  const convertRef = useRef<HTMLButtonElement>(null);
  const { status, errorMessage, convert, cancel, dismissError } =
    useNonPdfConversion({ file, plan, onConverted });

  const converting = status === "converting";
  const failed = status === "error";
  const formatName = plan.formatLabel;

  const handleCancel = () => {
    cancel();
    requestAnimationFrame(() => convertRef.current?.focus());
  };

  const handleOpenInConvert = () => {
    dismissError();
    onOpenInConvert?.();
  };

  const actionSize =
    variant === "hero" ? (isMobile ? "xl" : "lg") : isMobile ? "lg" : "md";

  const convertButton = (
    <Button
      ref={convertRef}
      size={actionSize}
      fullWidth={variant === "hero"}
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

  if (variant === "hero") {
    return (
      <>
        <div className="nonpdf-hero" data-testid="nonpdf-hero">
          <div className="nonpdf-hero__inner">
            <FileCover file={file} plan={plan} />
            <FileRow file={file} plan={plan} />
            <div className="nonpdf-hero__content">
              <h2 className="nonpdf-hero__title" dir="auto">
                {t("viewer.nonPdf.heroTitle", "Open as PDF")}
              </h2>
              <p className="nonpdf-hero__body" dir="auto">
                {t(
                  "viewer.nonPdf.heroBody",
                  "Read, annotate, sign, and combine this {{format}} as a PDF. The original stays in your workspace.",
                  { format: formatName },
                )}
              </p>

              {disabled ? (
                <Text size="sm" c="dimmed" dir="auto">
                  {t(
                    "viewer.nonPdf.convertDisabled",
                    "Conversion is turned off on this server. Ask your administrator to enable the Convert tool.",
                  )}
                </Text>
              ) : converting ? (
                <Box mt="md">
                  <ConversionProgress
                    file={file}
                    compact={false}
                    onCancel={handleCancel}
                  />
                </Box>
              ) : failed ? (
                <Box mt="md">
                  <ConversionError
                    compact={false}
                    onRetry={() => void convert()}
                    onOpenInConvert={handleOpenInConvert}
                    onDismiss={dismissError}
                    errorMessage={errorMessage}
                  />
                </Box>
              ) : (
                <div className="nonpdf-hero__actions">{convertButton}</div>
              )}
            </div>
          </div>
        </div>
      </>
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
                {formatName}
                {file.size > 0 ? ` · ${formatFileSize(file.size)}` : ""}
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
            <>{!failed && convertButton}</>
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
          onOpenInConvert={handleOpenInConvert}
          onDismiss={dismissError}
          errorMessage={errorMessage}
        />
      )}
    </Paper>
  );
}
