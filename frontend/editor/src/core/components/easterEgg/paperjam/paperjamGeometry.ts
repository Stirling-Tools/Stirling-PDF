/**
 * The brand mark as two movable parallelograms, and the maths that carries them
 * from the logo's pose in the nav rail to the paddle's pose at the foot of the
 * playfield.
 *
 * Both poses are parallelograms, so interpolating the four corners is an exact
 * affine tween with no intermediate distortion — the same property BrandMark.css
 * exploits to morph the logo into its chevron with a plain CSS matrix.
 */

export interface Point {
  x: number;
  y: number;
}

/** Corners in a fixed cycle — leftTop, rightTop, rightBottom, leftBottom. */
export type Quad = [Point, Point, Point, Point];

/** The mark's two pieces: `a` is the soft/back parallelogram, `b` the front one. */
export interface MarkPose {
  a: Quad;
  b: Quad;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The mark's own viewBox, matching the `d` attributes in BrandMark.tsx. */
const LOGO_VIEW_W = 71;
const LOGO_VIEW_H = 79;

const LOGO_A: Quad = [
  { x: 0, y: 39 },
  { x: 46.5, y: 0 },
  { x: 46.5, y: 35.5 },
  { x: 0, y: 74.5 },
];

const LOGO_B: Quad = [
  { x: 24, y: 43 },
  { x: 70.5, y: 4 },
  { x: 70.5, y: 39.5 },
  { x: 24, y: 78.5 },
];

/** How far the paddle's top edge leans right of its bottom edge. */
const PADDLE_SKEW = 10;
/** The sliver of playfield visible between the two pieces, measured across. */
const PADDLE_GAP = 10;

function fitQuad(
  quad: Quad,
  box: Box,
  scale: number,
  ox: number,
  oy: number,
): Quad {
  return quad.map((p) => ({
    x: box.x + ox + p.x * scale,
    y: box.y + oy + p.y * scale,
  })) as Quad;
}

/** The mark upright and centred inside `box`, preserving its aspect ratio. */
export function logoPose(box: Box): MarkPose {
  const scale = Math.min(box.w / LOGO_VIEW_W, box.h / LOGO_VIEW_H);
  const ox = (box.w - LOGO_VIEW_W * scale) / 2;
  const oy = (box.h - LOGO_VIEW_H * scale) / 2;
  return {
    a: fitQuad(LOGO_A, box, scale, ox, oy),
    b: fitQuad(LOGO_B, box, scale, ox, oy),
  };
}

/** One right-leaning parallelogram whose bottom edge runs `w` from `x`. */
function slantedBar(x: number, y: number, w: number, h: number): Quad {
  return [
    { x: x + PADDLE_SKEW, y },
    { x: x + w + PADDLE_SKEW, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * The mark laid flat as a paddle, sized to exactly fill the collision box so
 * what the ball hits is what the player sees.
 */
export function paddlePose(box: Box): MarkPose {
  // Each bar overhangs its bottom edge by the skew, so only the trailing piece's
  // overhang adds to the total: 2 * pieceW + gap + skew must equal the box width.
  const pieceW = (box.w - PADDLE_GAP - PADDLE_SKEW) / 2;
  const secondX = box.x + pieceW + PADDLE_GAP;
  return {
    a: slantedBar(box.x, box.y, pieceW, box.h),
    b: slantedBar(secondX, box.y, pieceW, box.h),
  };
}

function lerpQuad(from: Quad, to: Quad, t: number): Quad {
  return from.map((p, i) => ({
    x: p.x + (to[i].x - p.x) * t,
    y: p.y + (to[i].y - p.y) * t,
  })) as Quad;
}

export function lerpPose(from: MarkPose, to: MarkPose, t: number): MarkPose {
  return { a: lerpQuad(from.a, to.a, t), b: lerpQuad(from.b, to.b, t) };
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
