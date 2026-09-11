import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { Icon, isIconName, MISSING_ICON } from "@app/ui/Icon";
import { ICONS, type IconName } from "@app/icons/icons";
import { STROKE_WIDTH } from "@app/icons/icons.config";

const names = Object.keys(ICONS) as IconName[];

function renderIcon(
  name: IconName,
  props: Partial<{
    size: number;
    title: string;
    filled: boolean;
    colorless: boolean;
    className: string;
  }> = {},
) {
  const { container } = render(<Icon name={name} {...props} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error(`<Icon name="${name}"> rendered no svg`);
  return svg;
}

const classes = (svg: SVGSVGElement) => svg.getAttribute("class") ?? "";

describe("icon map", () => {
  it("covers both kinds", () => {
    expect(names.length).toBeGreaterThan(100);
    expect(
      names.filter((n) => ICONS[n].kind === "brand").length,
    ).toBeGreaterThan(0);
  });

  // Per icon, so a bad svg names itself rather than failing one opaque assertion.
  it.each(names)("%s draws on the 24 grid and paints something", (name) => {
    const svg = renderIcon(name);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.innerHTML.trim()).not.toBe("");
  });

  it("gives stroke icons the app weight and no fill", () => {
    const svg = renderIcon("circle");
    expect(svg.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH));
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("leaves brand marks their own colours", () => {
    const svg = renderIcon("googledrive");
    expect(svg.getAttribute("stroke-width")).toBeNull();
    expect(svg.getAttribute("fill")).toBeNull();
    expect(svg.querySelector('[fill="#0066DA"]')).not.toBeNull();
  });

  it("is decorative by default and labelled when given a title", () => {
    expect(renderIcon("circle").getAttribute("aria-hidden")).toBe("true");
    const labelled = renderIcon("circle", { title: "Round" });
    expect(labelled.getAttribute("aria-hidden")).toBeNull();
    expect(labelled.getAttribute("role")).toBe("img");
    expect(labelled.getAttribute("aria-label")).toBe("Round");
  });

  it("applies size to both dimensions", () => {
    const svg = renderIcon("circle", { size: 18 });
    expect(svg.getAttribute("width")).toBe("18");
    expect(svg.getAttribute("height")).toBe("18");
  });
});

describe("filled state", () => {
  it("fills a stroke icon on request and leaves it hollow otherwise", () => {
    expect(renderIcon("star", { filled: true }).getAttribute("fill")).toBe(
      "currentColor",
    );
    expect(renderIcon("star").getAttribute("fill")).toBe("none");
  });

  it("does not touch a brand mark", () => {
    expect(
      renderIcon("googledrive", { filled: true }).getAttribute("fill"),
    ).toBeNull();
  });
});

describe("colorless brand marks", () => {
  it("greys a brand mark on request", () => {
    expect(classes(renderIcon("googledrive", { colorless: true }))).toContain(
      "icon-colorless",
    );
  });

  it("keeps the call site's own class", () => {
    const svg = renderIcon("googledrive", {
      colorless: true,
      className: "file-source__mark",
    });
    expect(classes(svg)).toContain("file-source__mark");
    expect(classes(svg)).toContain("icon-colorless");
  });

  it("is inert without the prop, and on a stroke icon", () => {
    expect(classes(renderIcon("googledrive"))).not.toContain("icon-colorless");
    expect(classes(renderIcon("circle", { colorless: true }))).not.toContain(
      "icon-colorless",
    );
  });
});

describe("isIconName", () => {
  it("accepts mapped names and rejects everything else", () => {
    expect(isIconName("circle")).toBe(true);
    expect(isIconName("googledrive")).toBe(true);
    expect(isIconName("not-an-icon")).toBe(false);
    expect(isIconName(42)).toBe(false);
    expect(isIconName(undefined)).toBe(false);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "rejects inherited key %s",
    (key) => {
      expect(isIconName(key)).toBe(false);
    },
  );
});

describe("unknown names", () => {
  it("draws the placeholder instead of throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const svg = renderIcon("not-an-icon-at-all" as IconName, { size: 20 });
    expect(svg.getAttribute("data-missing-icon")).toBe("not-an-icon-at-all");
    expect(svg.innerHTML).toBe(renderIcon(MISSING_ICON).innerHTML);
    spy.mockRestore();
  });

  it("reports each unknown name once", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderIcon("repeated-bad-name" as IconName);
    renderIcon("repeated-bad-name" as IconName);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
