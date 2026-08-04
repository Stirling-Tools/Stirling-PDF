import { useState } from "react";

export interface DuplicatePagesParameters {
  pageIndices: number[];
  duplicateCount: number;
}

export const defaultDuplicatePagesParameters: DuplicatePagesParameters = {
  pageIndices: [],
  duplicateCount: 1,
};

export const useDuplicatePagesParameters = () => {
  const [parameters, setParameters] = useState<DuplicatePagesParameters>(
    defaultDuplicatePagesParameters,
  );

  const updateParameter = <K extends keyof DuplicatePagesParameters>(
    key: K,
    value: DuplicatePagesParameters[K],
  ) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  const resetParameters = () => setParameters(defaultDuplicatePagesParameters);

  const validateParameters = (): boolean => {
    return parameters.pageIndices.length > 0 && parameters.duplicateCount >= 1;
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
  };
};
