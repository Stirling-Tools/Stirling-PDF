import type { RankedStyle } from "@editor/tools/pdfTextEditor/commands/scanFit";
import { scanFaces } from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const facesAtRanking = new WeakMap<RankedStyle[], number>();

export function noteRankedWithCurrentFaces(ranked: RankedStyle[]): void {
  facesAtRanking.set(ranked, scanFaces().length);
}

export function rankedWithCurrentFaces(ranked: RankedStyle[]): boolean {
  return facesAtRanking.get(ranked) === scanFaces().length;
}
