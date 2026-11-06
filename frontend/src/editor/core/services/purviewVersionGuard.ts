import i18n from "i18next";
import { isMicrosoftProtectedPdf } from "@editor/services/rightsManagedPdf";

export async function assertOutputsKeepPurviewProtection(
  parents: readonly Blob[],
  outputs: readonly Blob[],
): Promise<void> {
  if (outputs.length === 0) return;
  const protectedParents = await Promise.all(
    parents.map((parent) => isMicrosoftProtectedPdf(parent)),
  );
  if (!protectedParents.some(Boolean)) return;
  const protectedOutputs = await Promise.all(
    outputs.map((output) => isMicrosoftProtectedPdf(output)),
  );
  if (protectedOutputs.every(Boolean)) return;
  throw new Error(
    i18n.t(
      "rightsManagedPdf.unprotectedVersionBlocked",
      "This change was not saved because it would keep an unprotected copy of a Microsoft Purview protected PDF.",
    ),
  );
}
