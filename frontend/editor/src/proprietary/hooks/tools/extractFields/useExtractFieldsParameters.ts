import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import type { DocparseMode } from "@app/hooks/tools/shared/docparseTypes";
import {
  emptyFieldRow,
  namedRows,
  type FieldRow,
} from "@app/hooks/tools/extractFields/fieldsSchema";

export interface ExtractFieldsParameters extends BaseParameters {
  /** Schema-builder rows; serialized to fieldsSchema on execute. */
  fields: FieldRow[];
  instructions: string;
  mode: DocparseMode;
}

export const defaultParameters: ExtractFieldsParameters = {
  fields: [emptyFieldRow()],
  instructions: "",
  mode: "auto",
};

export type ExtractFieldsParametersHook =
  BaseParametersHook<ExtractFieldsParameters>;

export const useExtractFieldsParameters = (): ExtractFieldsParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "extract-fields",
    validateFn: (params) => namedRows(params.fields).length > 0,
  });
};
