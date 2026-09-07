import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Icon } from "@app/ui/Icon";
import {
  ICONS,
  STROKE_WIDTH,
  type IconName,
} from "@app/icons/registry.generated";

const names = Object.keys(ICONS) as IconName[];

function renderIcon(
  name: IconName,
  props: Partial<{
    size: number;
    title: string;
    filled: boolean;
    colorless: boolean;
  }> = {},
) {
  const { container } = render(<Icon name={name} {...props} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error(`<Icon name="${name}"> rendered no svg`);
  return svg;
}

describe("icon registry", () => {
  it("is not empty", () => {
    expect(names.length).toBeGreaterThan(100);
  });

  // The whole point of the registry: every entry must actually draw something.
  // A silently empty icon looks like a layout bug, not an icon bug.
  it.each(names)("%s renders drawable geometry", (name) => {
    const svg = renderIcon(name);
    expect(svg.getAttribute("viewBox")).toMatch(/^[\d.\s-]+$/);
    expect(svg.innerHTML.length).toBeGreaterThan(0);
    expect(
      svg.querySelectorAll(
        "path, circle, rect, ellipse, line, polyline, polygon",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("gives monochrome icons the app stroke weight and no fill", () => {
    const svg = renderIcon("house");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH));
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("leaves brand marks their own colours", () => {
    const svg = renderIcon("s3");
    expect(svg.getAttribute("stroke")).toBeNull();
    expect(svg.getAttribute("fill")).toBeNull();
    expect(svg.querySelector("[fill^='#']")).not.toBeNull();
  });

  it("is decorative by default and labelled when given a title", () => {
    expect(renderIcon("house").getAttribute("aria-hidden")).toBe("true");
    const labelled = renderIcon("house", { title: "Home" });
    expect(labelled.getAttribute("aria-hidden")).toBeNull();
    expect(labelled.getAttribute("role")).toBe("img");
    expect(labelled.getAttribute("aria-label")).toBe("Home");
  });

  it("applies size to both dimensions", () => {
    const svg = renderIcon("house", { size: 18 });
    expect(svg.getAttribute("width")).toBe("18");
    expect(svg.getAttribute("height")).toBe("18");
  });
});

describe("filled state", () => {
  it("fills a mono icon on request and leaves it hollow otherwise", () => {
    expect(renderIcon("star").getAttribute("fill")).toBe("none");
    expect(renderIcon("star", { filled: true }).getAttribute("fill")).toBe(
      "currentColor",
    );
  });

  it("does not touch a brand mark", () => {
    const svg = renderIcon("s3", { filled: true });
    expect(svg.getAttribute("fill")).toBeNull();
    expect(svg.querySelector("[fill^='#']")).not.toBeNull();
  });
});

describe("colorless brand marks", () => {
  it("repoints every brand colour at currentColor", () => {
    const svg = renderIcon("googledrive", { colorless: true });
    expect(svg.querySelector("[fill^='#']")).toBeNull();
    expect(
      svg.querySelectorAll("[fill='currentColor']").length,
    ).toBeGreaterThan(0);
  });

  // A silhouette is the failure mode: Drive's six facets must stay separable,
  // or the mark reads as a solid triangle at sidebar sizes.
  it("keeps a multi-tone mark's facets distinguishable", () => {
    const svg = renderIcon("googledrive", { colorless: true });
    const opacities = new Set(
      [...svg.querySelectorAll("[opacity]")].map((el) =>
        el.getAttribute("opacity"),
      ),
    );
    expect(opacities.size).toBeGreaterThan(1);
    for (const value of opacities) {
      expect(Number(value)).toBeGreaterThanOrEqual(0.55);
      expect(Number(value)).toBeLessThanOrEqual(1);
    }
  });

  // Nothing to separate, so it must not be dimmed below the icons beside it.
  it("leaves a single-tone mark at full strength", () => {
    const svg = renderIcon("nextcloud", { colorless: true });
    expect(svg.querySelector("[opacity]")).toBeNull();
    expect(svg.querySelector("[stroke='currentColor']")).not.toBeNull();
  });

  it("preserves a white knockout so the detail does not merge away", () => {
    const svg = renderIcon("box", { colorless: true });
    expect(svg.querySelector("[stroke='#fff'], [fill='#fff']")).not.toBeNull();
  });

  it("is inert without the prop", () => {
    expect(
      renderIcon("googledrive").querySelector("[fill^='#']"),
    ).not.toBeNull();
  });
});

describe("id collisions", () => {
  // Two icons that both shipped an id like "clip0" would fight over url(#clip0)
  // once both are mounted, so the generator namespaces ids per icon.
  it("namespaces every declared id with its icon name", () => {
    for (const name of names) {
      const svg = renderIcon(name);
      for (const el of svg.querySelectorAll("[id]")) {
        expect(el.id.startsWith(`${name}-`)).toBe(true);
      }
    }
  });
});
