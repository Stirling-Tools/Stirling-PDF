import { availableOutputModes as cloudOutputModes } from "@portal-cloud/components/pipelines/outputModes";
import { availableOutputModes as serverOutputModes } from "@portal-proprietary/components/pipelines/outputModes";
import { editionFunction } from "@portal/edition";

/** Stirling Cloud delivers only to remote destinations; a self-hosted server can
 *  also write to its own folders. */
export const availableOutputModes = editionFunction<
  [],
  ReturnType<typeof serverOutputModes>
>(cloudOutputModes, () => serverOutputModes());
