import { useState } from "react";

export interface InsertBlankPagesParameters {
  position: number;
  count: number;
  pageSize: string;
}

export const defaultInsertBlankPagesParameters: InsertBlankPagesParameters = {
  position: 0,
  count: 1,
  pageSize: "A4",
};

export const useInsertBlankPagesParameters = () => {
  const [parameters, setParameters] = useState<InsertBlankPagesParameters>(
    defaultInsertBlankPagesParameters,
  );

  const updateParameter = <K extends keyof InsertBlankPagesParameters>(
    key: K,
    value: InsertBlankPagesParameters[K],
  ) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  const resetParameters = () => setParameters(defaultInsertBlankPagesParameters);

  const validateParameters = (): boolean => {
    return parameters.count >= 1 && parameters.position >= 0;
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
  };
};
