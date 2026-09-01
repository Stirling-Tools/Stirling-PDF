export interface TokenFit {
  letterSpacingPx: number;
  marginRightPx: number;
}

export const NO_TOKEN_FIT: TokenFit = {
  letterSpacingPx: 0,
  marginRightPx: 0,
};

const MAX_TRACK_EM = 0.25;
const EPSILON_PX = 0.01;

export function fitTokenAdvance(
  charCount: number,
  naturalPx: number,
  targetPx: number,
  fontSizePx: number,
): TokenFit {
  if (charCount <= 0) return NO_TOKEN_FIT;
  if (!Number.isFinite(naturalPx) || !Number.isFinite(targetPx)) {
    return NO_TOKEN_FIT;
  }
  if (naturalPx < 0 || targetPx < 0) return NO_TOKEN_FIT;

  const delta = targetPx - naturalPx;
  if (Math.abs(delta) < EPSILON_PX) return NO_TOKEN_FIT;

  let letterSpacingPx = 0;
  if (charCount > 1) {
    const cap = MAX_TRACK_EM * Math.max(0, fontSizePx);
    const even = delta / (charCount - 1);
    letterSpacingPx = Math.max(-cap, Math.min(cap, even));
  }
  return {
    letterSpacingPx,
    marginRightPx: delta - charCount * letterSpacingPx,
  };
}

export interface LineStack {
  topPx: number;
  marginTopsPx: number[];
}

export function stackLineBoxes(
  baselineTopsPx: number[],
  lineHeightPx: number,
  baselineFromBoxTopPx: number,
): LineStack | null {
  if (baselineTopsPx.length === 0) return null;
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
  if (!Number.isFinite(baselineFromBoxTopPx)) return null;
  if (!baselineTopsPx.every((v) => Number.isFinite(v))) return null;

  const marginTopsPx = baselineTopsPx.map((top, i) =>
    i === 0 ? 0 : top - baselineTopsPx[i - 1] - lineHeightPx,
  );
  return { topPx: baselineTopsPx[0] - baselineFromBoxTopPx, marginTopsPx };
}
