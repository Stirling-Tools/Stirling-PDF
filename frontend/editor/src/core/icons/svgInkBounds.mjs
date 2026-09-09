/** Bounding box of the ink in a parsed svg fragment, so the registry generator
 * can scale a brand mark by what it draws rather than by the viewBox its owner
 * happened to export. Curves and arcs are sampled, which keeps the box within
 * about 0.01 units of exact at the 24 grid; transforms and stroke widths are
 * honoured. Node shape is the generator's [tag, attrs, children?]. */

const CURVE_SAMPLES = 32;

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform-scale factor of a matrix, used to scale stroke widths. */
function scaleOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

const numbers = (s) =>
  (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

export function parseTransform(src) {
  let m = IDENTITY;
  if (!src) return m;
  for (const [, fn, args] of src.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = numbers(args);
    let t;
    switch (fn) {
      case "translate":
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        const rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        t = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [
          1,
          0,
          0,
          1,
          -cx,
          -cy,
        ]);
        break;
      }
      case "matrix":
        t = a.length === 6 ? a : IDENTITY;
        break;
      case "skewX":
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        throw new Error(`unsupported transform "${fn}"`);
    }
    m = multiply(m, t);
  }
  return m;
}

function ellipsePoints(cx, cy, rx, ry, from = 0, to = 2 * Math.PI) {
  const pts = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = from + ((to - from) * i) / CURVE_SAMPLES;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

function cubicPoints(p0, p1, p2, p3) {
  const pts = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0],
      u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** SVG arc (endpoint parameterisation, per the spec's F.6.5) sampled along
 * its sweep. Radii too small for the chord are scaled up as a renderer would. */
function arcPoints(p0, rx, ry, rotDeg, large, sweep, p1) {
  if (rx === 0 || ry === 0) return [p0, p1];
  const phi = (rotDeg * Math.PI) / 180;
  const [cosPhi, sinPhi] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cosPhi * dx + sinPhi * dy;
  const y1 = -sinPhi * dx + cosPhi * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cosPhi * cx1 - sinPhi * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sinPhi * cx1 + cosPhi * cy1 + (p0[1] + p1[1]) / 2;
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = theta1 + (delta * i) / CURVE_SAMPLES;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push([cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy]);
  }
  return pts;
}

/** Tokenises a path's `d`: command letters, and numbers with arc flags split
 * out ("0 0112 4" is two flags then 12 and 4). */
function tokenisePath(d) {
  const tokens = [];
  const re = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let cmd = null;
  let argIndex = 0;
  let i = 0;
  while (i < d.length) {
    re.lastIndex = i;
    const m = re.exec(d);
    if (!m) break;
    if (m.index > i && !/^[\s,]*$/.test(d.slice(i, m.index)))
      throw new Error(`unreadable path data near "${d.slice(i, i + 12)}"`);
    let tok = m[0];
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok;
      argIndex = 0;
      tokens.push(tok);
      i = m.index + 1;
      continue;
    }
    // Arc flags are single digits that may be glued to the next number.
    const isArc = cmd && cmd.toLowerCase() === "a";
    if (isArc && (argIndex % 7 === 3 || argIndex % 7 === 4)) {
      tok = d[m.index];
      i = m.index + 1;
    } else {
      i = m.index + tok.length;
    }
    tokens.push(Number(tok));
    argIndex++;
  }
  return tokens;
}

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function pathPoints(d) {
  const tokens = tokenisePath(d);
  const pts = [];
  let cur = [0, 0];
  let start = [0, 0];
  let prevCtrl = null;
  let prevCmd = "";
  let k = 0;
  while (k < tokens.length) {
    const cmd = tokens[k++];
    if (typeof cmd !== "string")
      throw new Error(`path data must start with a command: "${d}"`);
    let upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const n = ARGS[upper];
    if (n === undefined) throw new Error(`unsupported path command "${cmd}"`);
    do {
      const a = tokens.slice(k, k + n);
      if (a.length < n || a.some((v) => typeof v !== "number"))
        throw new Error(`path command ${cmd} is short of arguments in "${d}"`);
      k += n;
      const ax = (i) => (rel ? cur[0] + a[i] : a[i]);
      const ay = (i) => (rel ? cur[1] + a[i] : a[i]);
      switch (upper) {
        case "M":
          cur = [ax(0), ay(1)];
          start = cur;
          pts.push(cur);
          upper = "L"; // further pairs after a moveto are implicit linetos
          break;
        case "L":
          cur = [ax(0), ay(1)];
          pts.push(cur);
          break;
        case "H":
          cur = [ax(0), cur[1]];
          pts.push(cur);
          break;
        case "V":
          cur = [cur[0], ay(0)];
          pts.push(cur);
          break;
        case "C": {
          const p1 = [ax(0), ay(1)];
          const p2 = [ax(2), ay(3)];
          const p3 = [ax(4), ay(5)];
          pts.push(...cubicPoints(cur, p1, p2, p3));
          prevCtrl = p2;
          cur = p3;
          break;
        }
        case "S": {
          const reflect =
            /[CS]/i.test(prevCmd) && prevCtrl
              ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]]
              : cur;
          const p2 = [ax(0), ay(1)];
          const p3 = [ax(2), ay(3)];
          pts.push(...cubicPoints(cur, reflect, p2, p3));
          prevCtrl = p2;
          cur = p3;
          break;
        }
        case "Q": {
          const q = [ax(0), ay(1)];
          const p3 = [ax(2), ay(3)];
          pts.push(...cubicPoints(cur, lerpCtrl(cur, q), lerpCtrl(p3, q), p3));
          prevCtrl = q;
          cur = p3;
          break;
        }
        case "T": {
          const q =
            /[QT]/i.test(prevCmd) && prevCtrl
              ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]]
              : cur;
          const p3 = [ax(0), ay(1)];
          pts.push(...cubicPoints(cur, lerpCtrl(cur, q), lerpCtrl(p3, q), p3));
          prevCtrl = q;
          cur = p3;
          break;
        }
        case "A": {
          const p1 = [ax(5), ay(6)];
          pts.push(
            ...arcPoints(cur, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, p1),
          );
          cur = p1;
          break;
        }
        case "Z":
          cur = start;
          pts.push(cur);
          break;
      }
      prevCmd = upper;
      if (upper !== "C" && upper !== "S" && upper !== "Q" && upper !== "T")
        prevCtrl = null;
    } while (n > 0 && typeof tokens[k] === "number");
  }
  return pts;
}

/** Quadratic control point lifted to the equivalent cubic. */
function lerpCtrl(p, q) {
  return [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
}

function roundedRectPoints(x, y, w, h, rx, ry) {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0)
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  const q = Math.PI / 2;
  return [
    ...ellipsePoints(x + w - rx, y + ry, rx, ry, -q, 0),
    ...ellipsePoints(x + w - rx, y + h - ry, rx, ry, 0, q),
    ...ellipsePoints(x + rx, y + h - ry, rx, ry, q, 2 * q),
    ...ellipsePoints(x + rx, y + ry, rx, ry, 2 * q, 3 * q),
  ];
}

function shapePoints(tag, a) {
  const num = (k, d = 0) => (a[k] === undefined ? d : Number(a[k]));
  switch (tag) {
    case "path":
      return a.d ? pathPoints(a.d) : [];
    case "rect": {
      const rx = a.rx !== undefined ? num("rx") : num("ry");
      const ry = a.ry !== undefined ? num("ry") : rx;
      return roundedRectPoints(
        num("x"),
        num("y"),
        num("width"),
        num("height"),
        rx,
        ry,
      );
    }
    case "circle":
      return ellipsePoints(num("cx"), num("cy"), num("r"), num("r"));
    case "ellipse":
      return ellipsePoints(num("cx"), num("cy"), num("rx"), num("ry"));
    case "line":
      return [
        [num("x1"), num("y1")],
        [num("x2"), num("y2")],
      ];
    case "polygon":
    case "polyline": {
      const v = numbers(a.points ?? "");
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      return pts;
    }
    default:
      return [];
  }
}

const PAINTED = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
]);
const UNPAINTED = new Set([
  "defs",
  "clipPath",
  "mask",
  "symbol",
  "linearGradient",
  "radialGradient",
  "title",
  "desc",
  "metadata",
]);

/**
 * Bounds of everything the fragment paints, in the fragment's own user units.
 * Stroked outlines extend the box by half their width (scaled with the
 * element's transform); pass `{ stroke: false }` to measure geometry alone.
 * Returns null when nothing is drawn.
 */
export function inkBounds(nodes, { stroke = true } = {}) {
  let box = null;
  const visit = (list, ctm, inherited) => {
    for (const [tag, attrs, children] of list) {
      if (UNPAINTED.has(tag)) continue;
      const m = multiply(ctm, parseTransform(attrs.transform));
      const paint = {
        stroke: attrs.stroke ?? inherited.stroke,
        strokeWidth: attrs.strokeWidth ?? inherited.strokeWidth,
      };
      if (PAINTED.has(tag)) {
        const stroked = stroke && paint.stroke && paint.stroke !== "none";
        const pad = stroked
          ? (Number(paint.strokeWidth ?? 1) / 2) * scaleOf(m)
          : 0;
        for (const p of shapePoints(tag, attrs)) {
          const [x, y] = apply(m, p);
          if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
          box.minX = Math.min(box.minX, x - pad);
          box.minY = Math.min(box.minY, y - pad);
          box.maxX = Math.max(box.maxX, x + pad);
          box.maxY = Math.max(box.maxY, y + pad);
        }
      }
      if (children) visit(children, m, paint);
    }
  };
  visit(nodes, IDENTITY, {});
  return box;
}
