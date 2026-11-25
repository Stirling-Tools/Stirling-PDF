import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { IconName } from "@editor/ui/Icon";
import { useCreatePdf, type CreatePdfStage } from "@editor/hooks/useCreatePdf";
import { openFilesFromDisk } from "@editor/services/openFilesFromDisk";
import { CONVERT_SUPPORTED_FORMATS } from "@editor/constants/convertSupportedFornats";
import { useMultipleEndpointsEnabled } from "@editor/hooks/useEndpointConfig";
import { getEndpointName } from "@editor/utils/convertUtils";

export interface CreatePdfMenuItem {
  id: "blank" | "source";
  icon: IconName;
  label: string;
  description: string;
  onClick: () => void;
  testId: string;
}

const SOURCE_ENDPOINTS = new Map(
  CONVERT_SUPPORTED_FORMATS.map((ext) => [ext, getEndpointName(ext, "pdf")]),
);
const CONVERT_ENDPOINTS = [...new Set(SOURCE_ENDPOINTS.values())];

export function useCreatePdfMenu(): {
  items: CreatePdfMenuItem[];
  dialogs: ReactNode;
  stage: CreatePdfStage;
  busyLabel: string | null;
} {
  const { t } = useTranslation();
  const { stage, createBlank, createFromSource } = useCreatePdf();
  const convert = useMultipleEndpointsEnabled(CONVERT_ENDPOINTS);
  const sourceExtensions = useMemo(
    () => [
      "pdf",
      ...CONVERT_SUPPORTED_FORMATS.filter(
        (ext) =>
          convert.endpointStatus[SOURCE_ENDPOINTS.get(ext) ?? ""] === true,
      ),
    ],
    [convert.endpointStatus],
  );
  const canConvert = !convert.loading && sourceExtensions.length > 1;
  const sourceInputRef = useRef<HTMLInputElement | null>(null);

  const pickSource = useCallback(async () => {
    const [file] = await openFilesFromDisk({
      multiple: false,
      filters: [
        {
          name: t("createPdf.sourceFilter", "Documents and images"),
          extensions: sourceExtensions,
        },
      ],
      onFallbackOpen: () => sourceInputRef.current?.click(),
    });
    if (file) await createFromSource(file);
  }, [createFromSource, sourceExtensions, t]);

  const sourceItem = useMemo<CreatePdfMenuItem>(
    () => ({
      id: "source",
      icon: "file-convert",
      label: t("createPdf.source", "From another file"),
      description: t(
        "createPdf.sourceDesc",
        "Convert Word, Excel, images and more",
      ),
      onClick: () => void pickSource(),
      testId: "create-pdf-source",
    }),
    [t, pickSource],
  );

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
      ...(canConvert ? [sourceItem] : []),
    ],
    [t, createBlank, canConvert, sourceItem],
  );

  const dialogs = (
    <input
      ref={sourceInputRef}
      type="file"
      accept={sourceExtensions.map((ext) => `.${ext}`).join(",")}
      style={{ display: "none" }}
      data-testid="create-pdf-source-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void createFromSource(file);
      }}
    />
  );

  return { items, dialogs, stage, busyLabel: busyLabelFor(stage, t) };
}

function busyLabelFor(stage: CreatePdfStage, t: TFunction): string | null {
  switch (stage) {
    case "converting":
      return t("createPdf.converting", "Converting...");
    case "creating":
      return t("createPdf.creating", "Creating...");
    case "idle":
      return null;
  }
}
