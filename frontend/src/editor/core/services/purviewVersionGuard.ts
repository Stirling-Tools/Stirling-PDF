import i18n from "i18next";
import { isMicrosoftProtectedPdf } from "@editor/services/rightsManagedPdf";

export interface DerivedOutput {
  output: Blob;
  sources: readonly Blob[];
}

export async function assertOutputsKeepPurviewProtection(
  derived: readonly DerivedOutput[],
): Promise<void> {
  const checked = new Map<Blob, Promise<boolean>>();
  const isProtected = (blob: Blob) => {
    let result = checked.get(blob);
    if (!result) {
      result = isMicrosoftProtectedPdf(blob);
      checked.set(blob, result);
    }
    return result;
  };
  const leaks = await Promise.all(
    derived.map(async ({ output, sources }) => {
      const fromProtected = await Promise.all(sources.map(isProtected));
      return fromProtected.some(Boolean) && !(await isProtected(output));
    }),
  );
  if (!leaks.some(Boolean)) return;
  throw new Error(
    i18n.t(
      "rightsManagedPdf.unprotectedVersionBlocked",
      "This change was not saved because it would keep an unprotected copy of a Microsoft Purview protected PDF.",
    ),
  );
}
