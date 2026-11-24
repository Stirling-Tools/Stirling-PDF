import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import { useCreatePdf, type CreatePdfStage } from "@editor/hooks/useCreatePdf";
import { openFilesFromDisk } from "@editor/services/openFilesFromDisk";
import { CONVERT_SUPPORTED_FORMATS } from "@editor/constants/convertSupportedFornats";

export interface CreatePdfMenuItem {
  id: "blank" | "source";
  icon: IconName;
  label: string;
  description: string;
  onClick: () => void;
  testId: string;
}

const SOURCE_EXTENSIONS = ["pdf", ...CONVERT_SUPPORTED_FORMATS];

export function useCreatePdfMenu(): {
  items: CreatePdfMenuItem[];
  dialogs: ReactNode;
  stage: CreatePdfStage;
  busyLabel: string | null;
} {
  const { t } = useTranslation();
  const { stage, createBlank, createFromSource } = useCreatePdf();
  const sourceInputRef = useRef<HTMLInputElement | null>(null);

  const pickSource = useCallback(async () => {
    const [file] = await openFilesFromDisk({
      multiple: false,
      filters: [
        {
          name: t("createPdf.sourceFilter", "Documents and images"),
          extensions: SOURCE_EXTENSIONS,
        },
      ],
      onFallbackOpen: () => sourceInputRef.current?.click(),
    });
    if (file) await createFromSource(file);
  }, [createFromSource, t]);

  const items = useMemo<CreatePdfMenuItem[]>(
    () => [
      {
        id: "blank",
        icon: "file-plus",
        label: t("createPdf.blank", "Blank page"),
        description: t("createPdf.blankDesc", "Start writing on an empty page"),
        onClick: () => void createBlank(),
        testId: "create-pdf-blank",
      },
      {
        id: "source",
        icon: "file-convert",
        label: t("createPdf.source", "From another file"),
        description: t(
          "createPdf.sourceDesc",
          "Convert Word, Excel, images and more",
        ),
        onClick: () => void pickSource(),
        testId: "create-pdf-source",
      },
    ],
    [t, createBlank, pickSource],
  );

  const dialogs = (
    <input
      ref={sourceInputRef}
      type="file"
      accept={SOURCE_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
      style={{ display: "none" }}
      data-testid="create-pdf-source-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void createFromSource(file);
      }}
    />
  );

  const busyLabel =
    stage === "converting"
      ? t("createPdf.converting", "Converting…")
      : stage === "creating"
        ? t("createPdf.creating", "Creating…")
        : null;

  return { items, dialogs, stage, busyLabel };
}
