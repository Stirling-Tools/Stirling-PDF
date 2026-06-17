import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import CompressIcon from "@mui/icons-material/Compress";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFileOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LayersIcon from "@mui/icons-material/Layers";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { detectFileExtension, isPdfFile } from "@app/utils/fileUtils";
import type { StirlingFileStub } from "@app/types/fileContext";

const MAX_FILE_PILLS = 3;

interface QuickAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}

function QuickActionCard({ action }: { action: QuickAction }) {
  return (
    <UnstyledButton
      className="chat-quick-action"
      onClick={action.onClick}
      aria-label={action.title}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <Box className="chat-quick-action__icon">{action.icon}</Box>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={500}>
            {action.title}
          </Text>
          {action.subtitle && (
            <Text size="xs" c="dimmed" truncate>
              {action.subtitle}
            </Text>
          )}
        </Box>
        <KeyboardArrowDownIcon
          sx={{
            fontSize: 18,
            transform: "rotate(-90deg)",
            color: "var(--text-muted)",
          }}
        />
      </Group>
    </UnstyledButton>
  );
}

function WorkbenchFilePills({
  stubs,
  onOpenFilesModal,
  onRemove,
  moreLabel,
  removeLabel,
}: {
  stubs: StirlingFileStub[];
  onOpenFilesModal: () => void;
  onRemove: (id: StirlingFileStub["id"]) => void;
  moreLabel: (count: number) => string;
  removeLabel: (name: string) => string;
}) {
  const visible = stubs.slice(0, MAX_FILE_PILLS);
  const overflow = Math.max(0, stubs.length - visible.length);
  return (
    <div className="chat-file-pills">
      {visible.map((stub) => (
        <span key={stub.id} className="chat-file-pill">
          <InsertDriveFileIcon
            className="chat-file-pill__icon"
            sx={{ fontSize: 14 }}
          />
          <span className="chat-file-pill__label" title={stub.name}>
            {stub.name}
          </span>
          <button
            type="button"
            className="chat-file-pill__remove"
            onClick={() => onRemove(stub.id)}
            aria-label={removeLabel(stub.name)}
          >
            <CloseIcon sx={{ fontSize: 12 }} />
          </button>
        </span>
      ))}
      {overflow > 0 && (
        <UnstyledButton
          className="chat-file-pill chat-file-pill--more"
          onClick={onOpenFilesModal}
        >
          {moreLabel(overflow)}
        </UnstyledButton>
      )}
    </div>
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
  const { actions: fileActions } = useFileActions();
  const { openFilesModal } = useFilesModalContext();

  const summary = useMemo(() => summariseWorkbench(fileStubs), [fileStubs]);

  const actions = useMemo<QuickAction[]>(() => {
    const send = (text: string) => () => onAction(text);

    if (summary.fileCount === 0) {
      return [
        {
          key: "open-from-computer",
          icon: <UploadFileIcon sx={{ fontSize: 18 }} />,
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
            icon: <PictureAsPdfIcon sx={{ fontSize: 18 }} />,
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
          icon: <ContentCutIcon sx={{ fontSize: 18 }} />,
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
        icon: <CompressIcon sx={{ fontSize: 18 }} />,
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
        icon: <PictureAsPdfIcon sx={{ fontSize: 18 }} />,
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
      icon: <LayersIcon sx={{ fontSize: 18 }} />,
      title: mergeText,
      onClick: send(mergeText),
    });
    result.push({
      key: "compress",
      icon: <CompressIcon sx={{ fontSize: 18 }} />,
      title: compressText,
      onClick: send(compressText),
    });
    return result;
  }, [summary, t, onAction, openFilesModal]);

  return (
    <div className="chat-panel__quick-actions">
      {summary.fileCount > 0 && (
        <WorkbenchFilePills
          stubs={fileStubs}
          onOpenFilesModal={() => openFilesModal()}
          onRemove={(id) => fileActions.removeFiles([id])}
          moreLabel={(count) =>
            t("chat.quickActions.moreFiles", {
              count,
              defaultValue: "+{{count}} more",
            })
          }
          removeLabel={(name) =>
            t("chat.quickActions.removeFile", {
              name,
              defaultValue: "Remove {{name}}",
            })
          }
        />
      )}
      <Text className="chat-panel__quick-actions-label">{heading}</Text>
      <Stack gap="xs">
        {actions.map((action) => (
          <QuickActionCard key={action.key} action={action} />
        ))}
      </Stack>
    </div>
  );
}
