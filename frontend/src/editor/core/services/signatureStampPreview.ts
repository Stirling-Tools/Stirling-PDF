/**
 * Draws what the server will put in a visible certificate signature box, for placing it on the
 * page. Mirrors StampLayout.java and StampStyle.java: the constants and the arithmetic below must
 * stay in step with them, or the preview stops matching the signed file.
 */
const LEADING = 1.2;
const ASCENT = 0.75;
const PADDING_SCALE = 0.04;
const WRAP_GAIN = 1.25;
const SHRINK_STEP = 0.97;
const FONT = "'Noto Sans', 'Helvetica Neue', Arial, sans-serif";

/** The server's box when the user has not sized one, in PDF points. */
export const DEFAULT_STAMP_SIZE = { width: 200, height: 50 };

export interface StampPreviewContent {
  name: string;
  details: string[];
  /** What sits beside the details; IMAGE draws `image`, or the name until it has loaded. */
  graphic: "NAME" | "IMAGE" | "NONE";
  image: HTMLImageElement | null;
  /** The logo drawn faded behind everything, or null for none. */
  watermark: HTMLImageElement | null;
}

// Faint enough that the text over it stays easy to read; must match CertSignController.
const WATERMARK_OPACITY = 0.2;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBlock {
  fontSize: number;
  lines: string[];
  /** Each line's left edge; right-to-left lines align to the right. */
  lefts: number[];
  /** Baselines measured up from the bottom of the box. */
  baselines: number[];
}

export interface StampLayout {
  logo: Rect | null;
  name: TextBlock | null;
  details: TextBlock;
}

type Measure = (line: string) => number;

/** Scripts written without spaces, so a line may break between any two characters. */
const BREAKS_ANYWHERE =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const RIGHT_TO_LEFT =
  /^[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]$/u;

/** Whether the first letter of `line` is in a right-to-left script. */
export function readsRightToLeft(line: string): boolean {
  const first = [...line].find((char) => /\p{L}/u.test(char));
  return first !== undefined && RIGHT_TO_LEFT.test(first);
}

/**
 * The graphic (image, or else the name) in one half and the detail
 * lines in the other, side by side in a wide box and stacked in a tall one.
 */
export function layoutStamp(
  width: number,
  height: number,
  name: string | null,
  logoAspect: number,
  details: string[],
  measure: Measure,
): StampLayout {
  const padding = Math.min(width, height) * PADDING_SCALE;
  if (logoAspect <= 0 && name === null) {
    const whole = {
      x: padding,
      y: padding,
      width: width - 2 * padding,
      height: height - 2 * padding,
    };
    return { logo: null, name: null, details: block(whole, details, measure) };
  }
  let graphic: Rect;
  let text: Rect;
  if (width >= height) {
    const half = (width - 3 * padding) / 2;
    graphic = {
      x: padding,
      y: padding,
      width: half,
      height: height - 2 * padding,
    };
    text = {
      x: 2 * padding + half,
      y: padding,
      width: half,
      height: height - 2 * padding,
    };
  } else {
    const half = (height - 3 * padding) / 2;
    graphic = {
      x: padding,
      y: 2 * padding + half,
      width: width - 2 * padding,
      height: half,
    };
    text = { x: padding, y: padding, width: width - 2 * padding, height: half };
  }

  const detailBlock = block(text, details, measure);
  if (logoAspect > 0) {
    return {
      logo: centred(graphic, logoAspect),
      name: null,
      details: detailBlock,
    };
  }
  return {
    logo: null,
    name: block(graphic, [name ?? ""], measure),
    details: detailBlock,
  };
}

/** Where a watermark goes: centred behind everything, as large as the padded box allows. */
export function watermarkRect(
  width: number,
  height: number,
  aspect: number,
): Rect {
  const padding = Math.min(width, height) * PADDING_SCALE;
  return centred(
    {
      x: padding,
      y: padding,
      width: width - 2 * padding,
      height: height - 2 * padding,
    },
    aspect,
  );
}

function centred(area: Rect, aspect: number): Rect {
  let fittedWidth = area.width;
  let fittedHeight = fittedWidth / aspect;
  if (fittedHeight > area.height) {
    fittedHeight = area.height;
    fittedWidth = fittedHeight * aspect;
  }
  return {
    x: area.x + (area.width - fittedWidth) / 2,
    y: area.y + (area.height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

function block(area: Rect, lines: string[], measure: Measure): TextBlock {
  // Must match StampLayout.block: lines are fitted as if they ended in a space.
  const fit = fitLines(
    Math.max(area.width, 0),
    Math.max(area.height, 0),
    lines,
    (line) => measure(`${line} `),
  );
  const leading = fit.fontSize * LEADING;
  const height = fit.fontSize + (fit.lines.length - 1) * leading;
  const first = area.y + (area.height + height) / 2 - fit.fontSize * ASCENT;
  return {
    fontSize: fit.fontSize,
    lines: fit.lines.map((line) => line.text),
    lefts: fit.lines.map((line) =>
      line.rightToLeft
        ? area.x + area.width - measure(line.text) * fit.fontSize
        : area.x,
    ),
    baselines: fit.lines.map((_, index) => first - index * leading),
  };
}

function fitLines(
  width: number,
  height: number,
  lines: string[],
  measure: Measure,
): { fontSize: number; lines: Line[] } {
  const widest = Math.max(0, ...lines.map(measure));
  let unwrapped = height / ((lines.length - 1) * LEADING + 1);
  if (widest > 0) unwrapped = Math.min(unwrapped, width / widest);

  for (let size = height; size > unwrapped * WRAP_GAIN; size *= SHRINK_STEP) {
    const wrapped = wrapAll(lines, width / size, measure);
    if (wrapped && size * ((wrapped.length - 1) * LEADING + 1) <= height) {
      return { fontSize: size, lines: wrapped };
    }
  }
  return {
    fontSize: unwrapped,
    lines: lines.map((text) => ({ text, rightToLeft: readsRightToLeft(text) })),
  };
}

/** A drawn line; one wrapped from a right-to-left paragraph keeps its direction. */
interface Line {
  text: string;
  rightToLeft: boolean;
}

function wrapAll(
  paragraphs: string[],
  limit: number,
  measure: Measure,
): Line[] | null {
  const lines: Line[] = [];
  for (const paragraph of paragraphs) {
    const wrapped = wrap([paragraph], limit, measure);
    if (!wrapped) return null;
    const rightToLeft = readsRightToLeft(paragraph);
    lines.push(...wrapped.map((text) => ({ text, rightToLeft })));
  }
  return lines;
}

function wrap(
  lines: string[],
  limit: number,
  measure: Measure,
): string[] | null {
  const wrapped: string[] = [];
  for (const line of lines) {
    let current = "";
    for (const word of line.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= limit) {
        current = candidate;
        continue;
      }
      if (current) {
        wrapped.push(current);
        current = "";
      }
      if (measure(word) <= limit) {
        current = word;
        continue;
      }
      if (![...word].every((char) => BREAKS_ANYWHERE.test(char))) return null;
      for (const char of word) {
        if (measure(current + char) <= limit) {
          current += char;
        } else if (!current) {
          return null;
        } else {
          wrapped.push(current);
          current = char;
        }
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

/** Free text as the server splits it: one line per non-blank line, control characters as spaces. */
export function textLines(value: string): string[] {
  return value
    .split(/\r\n|\r|\n|\u2028|\u2029|\u0085/)
    .map((line) => line.trim().replace(/\p{Cc}/gu, " "))
    .filter(Boolean);
}

// Must match CertSignController.SENTENCE_END: a new sentence starts a new line.
const SENTENCE_END = /(?<=[.!?])\s+(?=\p{Lu})/u;

export interface StampLabels {
  signedByLabel: string;
  dateLabel: string;
  reasonLabel: string;
  locationLabel: string;
}

/** The labelled detail lines, built as CertSignController.detailLines builds them. */
export function stampDetails(
  labels: StampLabels,
  values: {
    name: string;
    date: Date;
    timeZone: string;
    reason: string;
    location: string;
    subject?: string | null;
  },
): string[] {
  const reason = textLines(values.reason).flatMap((line) =>
    line.split(SENTENCE_END),
  );
  const location = textLines(values.location);
  return [
    labels.signedByLabel.replace("{name}", values.name),
    ...(values.subject ? [`DN: ${values.subject}`] : []),
    ...reason.map((line, index) =>
      index === 0 ? `${labels.reasonLabel} ${line}` : line,
    ),
    ...(location.length
      ? [`${labels.locationLabel} ${location.join(" ")}`]
      : []),
    `${labels.dateLabel} ${formatStampDate(values.date, values.timeZone)}`,
  ];
}

/** A PNG data URL of the stamp at `width` x `height` points, drawn at `pixelsPerPoint`. */
export function renderStampPreview(
  content: StampPreviewContent,
  width = DEFAULT_STAMP_SIZE.width,
  height = DEFAULT_STAMP_SIZE.height,
  pixelsPerPoint = 4,
): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelsPerPoint);
  canvas.height = Math.round(height * pixelsPerPoint);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(pixelsPerPoint, pixelsPerPoint);

  ctx.font = `1px ${FONT}`;
  const aspectOf = (image: HTMLImageElement | null) =>
    image && image.naturalHeight > 0
      ? image.naturalWidth / image.naturalHeight
      : 0;
  const { watermark, image } = content;
  if (watermark && aspectOf(watermark) > 0) {
    const mark = watermarkRect(width, height, aspectOf(watermark));
    ctx.globalAlpha = WATERMARK_OPACITY;
    ctx.drawImage(
      watermark,
      mark.x,
      height - mark.y - mark.height,
      mark.width,
      mark.height,
    );
    ctx.globalAlpha = 1;
  }
  const imageGraphic = content.graphic === "IMAGE" && aspectOf(image) > 0;
  const layout = layoutStamp(
    width,
    height,
    content.graphic === "NONE" ? null : content.name,
    imageGraphic ? aspectOf(image) : 0,
    content.details,
    (line) => ctx.measureText(line).width,
  );

  if (image && layout.logo) {
    ctx.drawImage(
      image,
      layout.logo.x,
      height - layout.logo.y - layout.logo.height,
      layout.logo.width,
      layout.logo.height,
    );
  }
  ctx.fillStyle = "black";
  ctx.textBaseline = "alphabetic";
  for (const text of [layout.name, layout.details]) {
    if (!text) continue;
    ctx.font = `${text.fontSize}px ${FONT}`;
    text.lines.forEach((line, index) => {
      ctx.fillText(line, text.lefts[index], height - text.baselines[index]);
    });
  }
  return canvas.toDataURL("image/png");
}

export function readableDistinguishedName(rfc2253: string): string {
  const parts = rfc2253
    .split(/(?<!\\),/)
    .map((part) => part.trim())
    .filter(Boolean);
  const rank = (part: string) =>
    /^CN=/i.test(part) ? 0 : /^C=/i.test(part) ? 2 : 1;
  return [...parts].sort((a, b) => rank(a) - rank(b)).join(", ");
}

/** The sign time as the stamp writes it: `2026.11.24 10:12:05 +01'00'` in `timeZone`. */
export function formatStampDate(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const match = /([+-])(\d{2}):?(\d{2})/.exec(parts.timeZoneName ?? "");
  const offset = match ? `${match[1]}${match[2]}'${match[3]}'` : "+00'00'";
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}
