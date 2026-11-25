import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

/** Level B profiles, then level A: level B plus tagging for accessibility. */
export const PDFA_OUTPUT_FORMATS = [
  "pdfa-1",
  "pdfa-2b",
  "pdfa-3b",
  "pdfa-1a",
  "pdfa-2a",
  "pdfa-3a",
] as const;

export type PdfaOutputFormat = (typeof PDFA_OUTPUT_FORMATS)[number];

export const isPdfaOutputFormat = (value: unknown): value is PdfaOutputFormat =>
  (PDFA_OUTPUT_FORMATS as readonly unknown[]).includes(value);

export interface ArchivePdfParameters extends BaseParameters {
  outputFormat: PdfaOutputFormat;
  strict: boolean;
}

export const defaultParameters: ArchivePdfParameters = {
  outputFormat: "pdfa-2b",
  strict: false,
};

export type ArchivePdfParametersHook = BaseParametersHook<ArchivePdfParameters>;

export const useArchivePdfParameters = (): ArchivePdfParametersHook =>
  useBaseParameters({
    defaultParameters,
    endpointName: "pdf-to-pdfa",
  });
