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

describe("sign-in provider marks", () => {
  it("covers every monochrome mark", () => {
    const names = providerMarks.map((m) => m.name);
    for (const name of MONOCHROME_MARKS) expect(names).toContain(name);
  });

  it.each(providerMarks)(
    "$name follows its brand colour rule",
    ({ name, svg }) => {
      if (MONOCHROME_MARKS.has(name)) {
        expect(svg).toContain("currentColor");
        expect(svg).not.toMatch(/fill="#/);
      } else {
        expect(svg).not.toContain("currentColor");
      }
    },
  );
});
