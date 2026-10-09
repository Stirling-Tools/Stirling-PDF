import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { detectFileExtension, isPdfFile } from "@app/utils/fileUtils";
import type { StirlingFileStub } from "@app/types/fileContext";

interface QuickAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}

function QuickActionCard({ action }: { action: QuickAction }) {
  return (
    <Button
      type="button"
      variant="tertiary"
      hover={false}
      fullWidth
      py="sm"
      justify="start"
      className="chat-quick-action"
      onClick={action.onClick}
      aria-label={action.title}
      leftSection={
        <Box className="chat-quick-action__icon" style={{ marginRight: "5px" }}>
          {action.icon}
        </Box>
      }
      rightSection={
        <Icon
          name="chevron-down"
          size={18}
          style={{ transform: "rotate(-90deg)", color: "var(--c-text-subtle)" }}
        />
      }
    >
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" fw={500}>
          {action.title}
        </Text>
        {action.subtitle && (
          <Text size="xs" c="dimmed" truncate>
            {action.subtitle}
          </Text>
        )}
      </Box>
    </Button>
  );
}

interface WorkbenchSummary {
  fileCount: number;
  pdfCount: number;
  nonPdfCount: number;
  hasNonPdf: boolean;
  singleFilePageCount: number | null;
  typeBreakdown: { label: string; count: number }[];
}

function summariseWorkbench(stubs: StirlingFileStub[]): WorkbenchSummary {
  const counts = new Map<string, number>();
  let pdfCount = 0;
  let nonPdfCount = 0;

  for (const stub of stubs) {
    const ext = detectFileExtension(stub.name ?? "");
    const isPdf = isPdfFile({ name: stub.name, type: stub.type });
    if (isPdf) pdfCount += 1;
    else nonPdfCount += 1;
    const label = ext ? ext.toUpperCase() : "FILE";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const typeBreakdown = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  return {
    fileCount: stubs.length,
    pdfCount,
    nonPdfCount,
    hasNonPdf: nonPdfCount > 0,
    singleFilePageCount:
      stubs.length === 1 ? (stubs[0].processedFile?.totalPages ?? null) : null,
    typeBreakdown,
  };
}

export interface ChatQuickActionsProps {
  /** Heading text shown above the actions. */
  heading: string;
  /** Invoked when the user selects an action — sends the given text as a chat message. */
  onAction: (text: string) => void;
}

export function ChatQuickActions({ heading, onAction }: ChatQuickActionsProps) {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();
  const { openFilesModal } = useFilesModalContext();

  const summary = useMemo(() => summariseWorkbench(fileStubs), [fileStubs]);

  const actions = useMemo<QuickAction[]>(() => {
    const send = (text: string) => () => onAction(text);

    if (summary.fileCount === 0) {
      return [
        {
          key: "open-from-computer",
          icon: <Icon name="file-up" size={18} />,
          title: t("chat.quickActions.openFromComputer", "Open from computer"),
          subtitle: t("chat.quickActions.browseYourFiles", "Browse your files"),
          onClick: () => openFilesModal(),
        },
      ];
    }

    if (summary.fileCount === 1) {
      // Non-PDF: only suggest converting to PDF.
      if (summary.hasNonPdf) {
        const text = t(
          "chat.quickActions.convertOne",
          "Convert this document to PDF",
        );
        return [
          {
            key: "convert",
            icon: <Icon name="file-pdf" size={18} />,
            title: text,
            onClick: send(text),
          },
        ];
      }

      const result: QuickAction[] = [];
      const hasMultiplePages =
        summary.singleFilePageCount != null && summary.singleFilePageCount > 1;
      if (hasMultiplePages) {
        const text = t("chat.quickActions.splitOne", "Split this document");
        result.push({
          key: "split",
          icon: <Icon name="scissors" size={18} />,
          title: text,
          onClick: send(text),
        });
      }
      const compressText = t(
        "chat.quickActions.compressOne",
        "Compress this document",
      );
      result.push({
        key: "compress",
        icon: <Icon name="shrink" size={18} />,
        title: compressText,
        onClick: send(compressText),
      });
      return result;
    }

    // Multiple files.
    const result: QuickAction[] = [];
    if (summary.hasNonPdf) {
      const text = t(
        "chat.quickActions.convertMany",
        "Convert these documents to PDF",
      );
      result.push({
        key: "convert",
        icon: <Icon name="file-pdf" size={18} />,
        title: text,
        onClick: send(text),
      });
    }
    const mergeText = t("chat.quickActions.mergeMany", {
      count: summary.fileCount,
      defaultValue: "Merge these {{count}} documents into 1",
    });
    const compressText = t(
      "chat.quickActions.compressMany",
      "Compress these documents",
    );
    result.push({
      key: "merge",
      icon: <Icon name="layers" size={18} />,
      title: mergeText,
      onClick: send(mergeText),
    });
    result.push({
      key: "compress",
      icon: <Icon name="shrink" size={18} />,
      title: compressText,
      onClick: send(compressText),
    });
    return result;
  }, [summary, t, onAction, openFilesModal]);

  return (
    <div className="chat-panel__quick-actions">
      <Text className="chat-panel__quick-actions-label">{heading}</Text>
      <Stack gap="xs">
        {actions.map((action) => (
          <QuickActionCard key={action.key} action={action} />
        ))}
      </Stack>
    </div>
  );
}
