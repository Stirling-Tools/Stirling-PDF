import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  type ToolOperationConfig,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";
import {
  defaultParameters,
  validateCutAndTileParameters,
  type CutAndTileMode,
  type CutAndTileParameters,
  type CutPagesScope,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

const ENDPOINT_FOR_MODE = {
  grid: "/api/v1/general/split-pdf-by-sections",
  poster: "/api/v1/general/split-for-poster-print",
} as const satisfies Record<CutAndTileMode, ToolEndpoint>;

type CutAndTileEndpoint = (typeof ENDPOINT_FOR_MODE)[CutAndTileMode];
type CutAndTileApiParams = ToolApiParams[CutAndTileEndpoint];
type SectionsApiParams = ToolApiParams[(typeof ENDPOINT_FOR_MODE)["grid"]];
type PosterApiParams = ToolApiParams[(typeof ENDPOINT_FOR_MODE)["poster"]];

const SPLIT_MODE: Record<Exclude<CutPagesScope, "custom">, string> = {
  all: "SPLIT_ALL",
  exceptFirst: "SPLIT_ALL_EXCEPT_FIRST",
  exceptLast: "SPLIT_ALL_EXCEPT_LAST",
  exceptFirstAndLast: "SPLIT_ALL_EXCEPT_FIRST_AND_LAST",
};

export const cutAndTileToApiParams = (
  parameters: CutAndTileParameters,
): CutAndTileApiParams => {
  if (parameters.mode === "grid") {
    const sections: SectionsApiParams = {
      horizontalDivisions: Number(parameters.rows) - 1,
      verticalDivisions: Number(parameters.columns) - 1,
      merge: parameters.assemble,
      splitMode: (parameters.cutPages === "custom"
        ? "CUSTOM"
        : SPLIT_MODE[parameters.cutPages]) as SectionsApiParams["splitMode"],
    };
    if (parameters.cutPages === "custom" && parameters.customPages) {
      sections.pageNumbers = parameters.customPages;
    }
    return sections;
  }

  const poster: PosterApiParams = {
    pageSize: (parameters.pageSize || "A4") as PosterApiParams["pageSize"],
    xFactor: Number(parameters.tileColumns),
    yFactor: Number(parameters.tileRows),
    rightToLeft: parameters.rightToLeft,
  };
  return poster;
};

export const cutAndTileFromApiParams = (
  apiParams: CutAndTileApiParams,
): Partial<CutAndTileParameters> => {
  if ("pageSize" in apiParams) {
    return {
      mode: "poster",
      pageSize: apiParams.pageSize,
      tileColumns:
        apiParams.xFactor !== undefined ? `${apiParams.xFactor}` : undefined,
      tileRows:
        apiParams.yFactor !== undefined ? `${apiParams.yFactor}` : undefined,
      rightToLeft: apiParams.rightToLeft ?? defaultParameters.rightToLeft,
    };
  }
  const splitMode = apiParams.splitMode;
  const scope: CutPagesScope =
    splitMode === "CUSTOM"
      ? "custom"
      : splitMode === "SPLIT_ALL_EXCEPT_FIRST"
        ? "exceptFirst"
        : splitMode === "SPLIT_ALL_EXCEPT_LAST"
          ? "exceptLast"
          : splitMode === "SPLIT_ALL_EXCEPT_FIRST_AND_LAST"
            ? "exceptFirstAndLast"
            : "all";
  return {
    mode: "grid",
    rows:
      apiParams.horizontalDivisions !== undefined
        ? `${apiParams.horizontalDivisions + 1}`
        : undefined,
    columns:
      apiParams.verticalDivisions !== undefined
        ? `${apiParams.verticalDivisions + 1}`
        : undefined,
    assemble: apiParams.merge ?? false,
    cutPages: scope,
    customPages:
      scope === "custom"
        ? apiParams.pageNumbers
        : defaultParameters.customPages,
  };
};

export const buildCutAndTileFormData = (
  parameters: CutAndTileParameters,
  file: File,
): FormData =>
  objectToFormData(cutAndTileToApiParams(parameters), { fileInput: file });

export const getCutAndTileEndpoint = (
  parameters: CutAndTileParameters,
): CutAndTileEndpoint => ENDPOINT_FOR_MODE[parameters.mode];

export const cutAndTileOperationConfig = defineSingleFileTool({
  validateParams: validateCutAndTileParameters,
  buildFormData: buildCutAndTileFormData,
  toApiParams: cutAndTileToApiParams,
  fromApiParams: cutAndTileFromApiParams,
  operationType: "cutAndTile",
  endpoint: getCutAndTileEndpoint,
  endpoints: Array.from(new Set(Object.values(ENDPOINT_FOR_MODE))),
  defaultParameters,
});

export const useCutAndTileOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  const responseHandler = useCallback(
    async (blob: Blob): Promise<File[]> => extractZipFiles(blob),
    [extractZipFiles],
  );

  const config: ToolOperationConfig<CutAndTileParameters> = {
    ...cutAndTileOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(
      t("cutAndTile.error.failed", "Could not cut the pages."),
    ),
  };

  return useToolOperation(config);
};
