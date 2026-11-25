import { creatableSourceTypes as cloudCreatableSourceTypes } from "@processor-cloud/components/sources/creatableSourceTypes";
import { creatableSourceTypes as serverCreatableSourceTypes } from "@processor-proprietary/components/sources/creatableSourceTypes";
import { editionFunction } from "@processor/edition";

/** Stirling Cloud never reads a server folder; a self-hosted server can. */
export const creatableSourceTypes = editionFunction(
  cloudCreatableSourceTypes,
  serverCreatableSourceTypes,
);
