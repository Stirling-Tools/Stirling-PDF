import { describe, expect, it } from "vitest";
import { runsPushedBelow } from "@editor/tools/pdfTextEditor/commands/pushRunsBelow";
import { rotationFromMatrix } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

let fieldReads = 0;

function run(
  id: string,
  bounds: Bounds,
  extra: { locked?: boolean; b?: number; renderMode?: number } = {},
): TextRun {
  return {
    get id() {
      fieldReads++;
      return id;
    },
    get bounds() {
      fieldReads++;
      return bounds;
    },
    text: "x",
    matrix: { a: 1, b: extra.b ?? 0, c: 0, d: 1, e: bounds.x, f: bounds.y },
    fontSize: 12,
    locked: extra.locked ?? false,
    containerPtr: 0,
    renderMode: extra.renderMode ?? 0,
    scanEdit: null,
  } as unknown as TextRun;
}

function page(
  runs: TextRun[],
  cellRuns: string[][] = [],
  cropBottom = 0,
): Page {
  return {
    runs,
    findRun: (id: string) => runs.find((r) => r.id === id),
    tables: cellRuns.length
      ? [
          {
            cellRuns,
            cellExtraRuns: cellRuns.map((row) => row.map(() => null)),
          },
        ]
      : [],
    display: { cropBottom },
  } as unknown as Page;
}

function referencePushedBelow(
  page: Page,
  edited: TextRun,
  oldBottom: number,
  addedHeight = 0,
): { runIds: string[]; dy: number } {
  const top = (r: TextRun) => r.bounds.y + r.bounds.height;
  const inTable = (id: string) =>
    page.tables.some(
      (t) =>
        t.cellRuns.some((row) => row.includes(id)) ||
        t.cellExtraRuns.some((row) => row.some((e) => e?.includes(id))),
    );
  const canMove = (r: TextRun) =>
    !r.locked &&
    !rotationFromMatrix(r.matrix) &&
    r.renderMode !== 3 &&
    !inTable(r.id);
  const depth = (a: PageRect, b: PageRect) =>
    a.x >= b.x + b.width - 0.5 || a.x + a.width <= b.x + 0.5
      ? 0
      : Math.max(
          0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
        );
  const overlayBox = (r: TextRun): PageRect => {
    const boxTop = r.matrix.f + 0.95 * r.fontSize;
    const y = Math.min(r.bounds.y, boxTop - 1.45 * r.fontSize);
    return {
      x: r.bounds.x,
      y,
      width: r.bounds.width,
      height: Math.max(top(r), boxTop) - y,
    };
  };
  const grown = oldBottom - edited.bounds.y;
  const none = { runIds: [], dy: 0 };
  if (grown <= 0.5 || !canMove(edited) || inTable(edited.id)) return none;
  const drop =
    Math.abs(grown - addedHeight) <= edited.fontSize * 0.5
      ? addedHeight
      : grown;
  const tolerance = edited.fontSize * 0.25;
  const left = edited.bounds.x;
  const right = edited.bounds.x + edited.bounds.width;
  const clearance = edited.fontSize * 0.1;
  let limit = edited.bounds.y;
  let limitBefore = oldBottom;
  const pushed: string[] = [];
  for (const r of page.runs
    .filter((r) => r !== edited && top(r) <= oldBottom + tolerance)
    .sort((a, b) => top(b) - top(a))) {
    if (!(r.bounds.x < right && r.bounds.x + r.bounds.width > left)) continue;
    if (top(r) <= limit - Math.min(clearance, limitBefore - top(r)) + 0.5)
      break;
    if (!canMove(r) || r.bounds.y - drop < page.display.cropBottom) return none;
    pushed.push(r.id);
    if (r.bounds.y - drop < limit) {
      limit = r.bounds.y - drop;
      limitBefore = r.bounds.y;
    }
  }
  const moving = new Set(pushed);
  const chain = page.runs.filter((r) => moving.has(r.id));
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    const swept = {
      ...r.bounds,
      y: r.bounds.y - drop,
      height: r.bounds.height + drop,
    };
    for (const other of page.runs) {
      if (other.id === edited.id || moving.has(other.id)) continue;
      const before = depth(r.bounds, other.bounds);
      const among = before > other.bounds.height * 0.5;
      const inkHit = among || !(depth(swept, other.bounds) <= before + 0.5);
      const movable =
        canMove(other) && !(other.bounds.y - drop < page.display.cropBottom);
      if (!inkHit) {
        const box = overlayBox(r);
        const otherBox = overlayBox(other);
        const sweptBox = { ...box, y: box.y - drop, height: box.height + drop };
        if (depth(sweptBox, otherBox) <= depth(box, otherBox) + 0.5 || !movable)
          continue;
      } else if (!movable) return none;
      moving.add(other.id);
      chain.push(other);
    }
  }
  return {
    runIds: [
      ...pushed,
      ...chain.map((r) => r.id).filter((id) => !pushed.includes(id)),
    ],
    dy: -drop,
  };
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomLayout(seed: number) {
  const random = seeded(seed);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const fontSize = pick([9, 12, 18]);
  const edited = run(
    "edited",
    {
      x: random() * 200,
      y: 400 + random() * 100,
      width: 40 + random() * 400,
      height: fontSize * (1 + Math.floor(random() * 3)),
    },
    {},
  );
  (edited as { fontSize: number }).fontSize = fontSize;
  const runs: TextRun[] = [edited];
  const odd = () => {
    const roll = random();
    return roll < 0.02 ? -5 : roll < 0.03 ? 0 : roll < 0.035 ? NaN : null;
  };
  const extra = () => ({
    locked: random() < 0.01,
    b: random() < 0.01 ? 0.5 : 0,
    renderMode: random() < 0.01 ? 3 : 0,
  });
  const id = (i: number) =>
    random() < 0.03 ? `r${Math.floor(random() * i)}` : `r${i}`;
  const pitch = fontSize * (0.8 + random() * 0.8);
  const rows = 2 + Math.floor(random() * 25);
  for (let row = 0; row < rows; row++) {
    const y = edited.bounds.y - (row + 1) * pitch + (random() - 0.5) * 6;
    for (let k = Math.floor(random() * 4); k >= 0; k--) {
      const height = odd() ?? fontSize * (0.8 + random() * (row % 7 ? 0.5 : 3));
      runs.push(
        run(
          id(runs.length),
          { x: random() * 500, y, width: 5 + random() * 300, height },
          extra(),
        ),
      );
    }
  }
  for (let i = Math.floor(random() * 10); i > 0; i--)
    runs.push(
      run(
        id(runs.length),
        {
          x: random() * 500,
          y: random() * 520,
          width: 5 + random() * 300,
          height: odd() ?? 4 + random() * 30,
        },
        extra(),
      ),
    );
  runs.sort(() => random() - 0.5);
  const tabled = runs.filter(() => random() < 0.03).map((r) => r.id);
  const oldBottom = edited.bounds.y + 5 + random() * 60;
  const addedHeight = pick([0, oldBottom - edited.bounds.y, 15, 30]);
  return {
    page: page(runs, tabled.length ? [tabled] : [], pick([0, 0, 0, 0, 200])),
    edited,
    oldBottom,
    addedHeight,
  };
}

// Every column overlaps its neighbour by 10pt, so only the first column lies
// under the edited line and the rest are found by landing on each other.
function overlappingGrid(count: number): {
  page: Page;
  edited: TextRun;
} {
  const edited = run("edited", { x: 0, y: 99970, width: 40, height: 12 });
  const runs = [edited];
  for (let i = 0; i < count; i++)
    runs.push(
      run(`r${i}`, {
        x: (i % 20) * 50,
        y: 99984 - Math.floor(i / 20) * 14,
        width: 60,
        height: 12,
      }),
    );
  return { page: page(runs), edited };
}

describe("runsPushedBelow planning", () => {
  it("chooses exactly what checking every run against every moving run chooses", () => {
    let moved = 0;
    let landed = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const { page, edited, oldBottom, addedHeight } = randomLayout(seed);
      const expected = referencePushedBelow(
        page,
        edited,
        oldBottom,
        addedHeight,
      );
      expect(
        runsPushedBelow(page, edited, oldBottom, addedHeight),
        `seed ${seed}`,
      ).toEqual(expected);
      if (expected.runIds.length > 1) moved++;
      if (
        expected.runIds.some(
          (id) =>
            !page.runs.some(
              (r) =>
                r.id === id &&
                r.bounds.x < edited.bounds.x + edited.bounds.width &&
                r.bounds.x + r.bounds.width > edited.bounds.x,
            ),
        )
      )
        landed++;
    }
    expect(moved).toBeGreaterThan(300);
    expect(landed).toBeGreaterThan(200);
  });

  it("finds a grid by landing in the same order as checking every pair", () => {
    const { page, edited } = overlappingGrid(2_000);
    const expected = referencePushedBelow(page, edited, 100000, 30);
    expect(expected.runIds).toHaveLength(2_000);
    expect(runsPushedBelow(page, edited, 100000, 30)).toEqual(expected);
  });

  it("finds a grid of 10,000 runs by landing without comparing every pair", () => {
    const count = 10_000;
    const { page, edited } = overlappingGrid(count);
    fieldReads = 0;
    const planned = runsPushedBelow(page, edited, 100000, 30);
    expect(new Set(planned.runIds).size).toBe(count);
    expect(fieldReads).toBeLessThan(count * 400);
  });

  it("does not revisit a grid that is already moving as a whole", () => {
    const count = 10_000;
    const edited = run("edited", { x: 0, y: 7970, width: 1200, height: 12 });
    const runs = [edited];
    for (let i = 0; i < count; i++)
      runs.push(
        run(`r${i}`, {
          x: (i % 20) * 50,
          y: 7984 - Math.floor(i / 20) * 14,
          width: 40,
          height: 12,
        }),
      );
    fieldReads = 0;
    expect(runsPushedBelow(page(runs), edited, 8000, 30).runIds).toHaveLength(
      count,
    );
    expect(fieldReads).toBeLessThan(count * 100);
  });
});
