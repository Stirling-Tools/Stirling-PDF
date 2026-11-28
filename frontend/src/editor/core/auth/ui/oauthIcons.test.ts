import { describe, expect, it } from "vitest";

import { MONOCHROME_MARKS, oauthIconName } from "@editor/auth/ui/oauthIcons";

const marks = import.meta.glob<string>("../../icons/svg/third-party/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const providerMarks = Object.entries(marks).flatMap(([path, svg]) => {
  const name = oauthIconName(path.split("/").pop() ?? "");
  return name ? [{ name, svg }] : [];
});

// Every SVG paint property, whether set as an attribute or in a style
// declaration. The name must be followed by `=` or `:` so fill-rule,
// stroke-width and the like are not mistaken for paints.
const PAINT =
  /(?<![\w-])(fill|stroke|stop-color|flood-color|lighting-color|color)\s*[=:]\s*["']?([^"';}\s>]+)/g;
const MONOCHROME_PAINTS = new Set(["currentColor", "none"]);

function paintValues(svg: string): string[] {
  return [...svg.matchAll(PAINT)].map((match) => match[2]);
}

describe("sign-in provider marks", () => {
  it("covers every monochrome mark", () => {
    const names = providerMarks.map((m) => m.name);
    for (const name of MONOCHROME_MARKS) expect(names).toContain(name);
  });

  it.each(providerMarks)(
    "$name follows its brand colour rule",
    ({ name, svg }) => {
      if (MONOCHROME_MARKS.has(name)) {
        const paints = paintValues(svg);
        expect(paints).toContain("currentColor");
        for (const paint of paints) expect(MONOCHROME_PAINTS).toContain(paint);
      } else {
        expect(svg).not.toContain("currentColor");
      }
    },
  );
});
