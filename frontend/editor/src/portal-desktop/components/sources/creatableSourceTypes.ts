import { creatableSourceTypes as cloudCreatableSourceTypes } from "@portal-cloud/components/sources/creatableSourceTypes";
import { creatableSourceTypes as serverCreatableSourceTypes } from "@portal-proprietary/components/sources/creatableSourceTypes";
import { editionFunction } from "@portal/edition";

/** Stirling Cloud never reads a server folder; a self-hosted server can. */
export const creatableSourceTypes = editionFunction(
  cloudCreatableSourceTypes,
  serverCreatableSourceTypes,
);
