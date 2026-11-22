import type { Affine } from "@editor/tools/pdfTextEditor/types";

export const FAUX_ITALIC_SLANT = Math.tan((12 * Math.PI) / 180);

const SLANT_TOLERANCE = 0.02;

type Linear = Pick<Affine, "a" | "b" | "c" | "d">;

export function slantOf(matrix: Linear): number {
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  const along = matrix.a * matrix.a + matrix.b * matrix.b;
  if (!det || !along) return 0;
  return (matrix.a * matrix.c + matrix.b * matrix.d) / det;
}

export function withSlant<T extends Linear>(matrix: T, slant: number): T {
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  const along = matrix.a * matrix.a + matrix.b * matrix.b;
  if (!det || !along) return matrix;
  const shear =
    (slant * det - (matrix.a * matrix.c + matrix.b * matrix.d)) / along;
  return {
    ...matrix,
    c: matrix.c + shear * matrix.a,
    d: matrix.d + shear * matrix.b,
  };
}

export function isFauxItalic(run: { matrix: Linear }): boolean {
  return Math.abs(slantOf(run.matrix) - FAUX_ITALIC_SLANT) <= SLANT_TOLERANCE;
}
