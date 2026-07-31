import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { TrappedStatus, CustomMetadataEntry } from "@app/types/metadata";
import {
  ChangeMetadataParameters,
  defaultParameters,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

const ENDPOINT = "/api/v1/misc/update-metadata" satisfies ToolEndpoint;
type ChangeMetadataApiParams = ToolApiParams[typeof ENDPOINT];

// Backend date format (yyyy/MM/dd HH:mm:ss), in local time to mirror the parser.
const formatDateForBackend = (date: Date | null): string => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

// Inverse of formatDateForBackend; returns null for empty or unparseable input.
const parseDateFromBackend = (value: string | undefined): Date | null => {
  if (!value) return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value,
  );
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
};

// Custom metadata is carried in the request's allRequestParams map as paired
// customKey<N>/customValue<N> entries; the backend rejoins them by the shared
// index N (see MetadataController). Only entries with a non-blank key and value
// are sent, and they are re-numbered from 1 so the indices stay contiguous.
const buildCustomMetadataMap = (
  customMetadata: CustomMetadataEntry[],
): Record<string, string> | undefined => {
  const validEntries = customMetadata.filter(
    (entry) => entry.key.trim() && entry.value.trim(),
  );
  if (validEntries.length === 0) return undefined;

  const map: Record<string, string> = {};
  validEntries.forEach((entry, index) => {
    const n = index + 1;
    map[`customKey${n}`] = entry.key.trim();
    map[`customValue${n}`] = entry.value.trim();
  });
  return map;
};

// Rebuild the UI's custom metadata list from the allRequestParams map by pairing
// customKey<N>/customValue<N> on their shared index N. Mirrors the backend
// (MetadataController), which pairs by index across all entries and does not
// assume the indices are contiguous, so a non-contiguous stored map round-trips.
const parseCustomMetadataMap = (
  allRequestParams: ChangeMetadataApiParams["allRequestParams"],
): CustomMetadataEntry[] => {
  if (!allRequestParams) return [];
  return Object.keys(allRequestParams)
    .map((key) => /^customKey(\d+)$/.exec(key)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({
      key: allRequestParams[`customKey${n}`] ?? "",
      value: allRequestParams[`customValue${n}`] ?? "",
      id: `custom${n}`,
    }));
};

// Map the backend's trapped string onto the UI enum, validating against the
// actual enum values so an unrecognised value falls back to the default instead
// of being force-cast.
const parseTrapped = (value: string | undefined): TrappedStatus =>
  Object.values(TrappedStatus).find((status) => status === value) ??
  defaultParameters.trapped;

// Convert the tool's UI parameters into the update-metadata request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const changeMetadataToApiParams = (
  parameters: ChangeMetadataParameters,
): ChangeMetadataApiParams => ({
  title: parameters.title,
  author: parameters.author,
  subject: parameters.subject,
  keywords: parameters.keywords,
  creator: parameters.creator,
  producer: parameters.producer,
  creationDate: formatDateForBackend(parameters.creationDate),
  modificationDate: formatDateForBackend(parameters.modificationDate),
  trapped: parameters.trapped,
  deleteAll: parameters.deleteAll,
  allRequestParams: buildCustomMetadataMap(parameters.customMetadata),
});

// Reconstruct the tool's UI parameters from an update-metadata request body, so
// a stored or AI-authored step can be re-rendered in the settings UI.
export const changeMetadataFromApiParams = (
  apiParams: ChangeMetadataApiParams,
): Partial<ChangeMetadataParameters> => ({
  title: apiParams.title ?? defaultParameters.title,
  author: apiParams.author ?? defaultParameters.author,
  subject: apiParams.subject ?? defaultParameters.subject,
  keywords: apiParams.keywords ?? defaultParameters.keywords,
  creator: apiParams.creator ?? defaultParameters.creator,
  producer: apiParams.producer ?? defaultParameters.producer,
  creationDate: parseDateFromBackend(apiParams.creationDate),
  modificationDate: parseDateFromBackend(apiParams.modificationDate),
  trapped: parseTrapped(apiParams.trapped),
  deleteAll: apiParams.deleteAll ?? defaultParameters.deleteAll,
  customMetadata: parseCustomMetadataMap(apiParams.allRequestParams),
});

// Static function that can be used by both the hook and automation executor
export const buildChangeMetadataFormData = (
  parameters: ChangeMetadataParameters,
  file: File,
): FormData => {
  // allRequestParams is a Spring-bound map: objectToFormData only serializes
  // primitives, so the scalar fields go through it and the map is flattened into
  // allRequestParams[<key>] form fields separately.
  const { allRequestParams, ...scalarParams } =
    changeMetadataToApiParams(parameters);
  const formData = objectToFormData(scalarParams, { fileInput: file });
  for (const [key, value] of Object.entries(allRequestParams ?? {})) {
    if (value !== undefined) {
      formData.append(`allRequestParams[${key}]`, value);
    }
  }
  return formData;
};

// Static configuration object
export const changeMetadataOperationConfig = defineSingleFileTool({
  buildFormData: buildChangeMetadataFormData,
  toApiParams: changeMetadataToApiParams,
  fromApiParams: changeMetadataFromApiParams,
  operationType: "changeMetadata",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useChangeMetadataOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ChangeMetadataParameters>({
    ...changeMetadataOperationConfig,
    filePrefix: t("changeMetadata.filenamePrefix", "metadata") + "_",
    getErrorMessage: createStandardErrorHandler(
      t(
        "changeMetadata.error.failed",
        "An error occurred while changing the PDF metadata.",
      ),
    ),
  });
};
