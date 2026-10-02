import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { updatePublicPage } from "@app/utils/updatePublicPage";
import { publicPageManifest } from "@app/data/publicPageManifest";
import { buildBodyContent, injectOg } from "@app/utils/publicPageSeo.mjs";

function installShell(noindex = false) {
  const config = {
    ogBase: "https://stirling.com/app",
    canonicalBase: "https://stirling.com/app",
    noindex,
  };
  document.head.innerHTML = `<script id="stirling-page-config" type="application/json">${JSON.stringify(config)}</script>`;
  document.body.innerHTML = '<div id="root"></div>';
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.body.removeAttribute("data-public-page");
});

describe("public page lifecycle", () => {
  it("retains ordinary public content while React replaces the workspace", () => {
    installShell();
    const entry = publicPageManifest.byTool.compress;
    document.body.innerHTML = buildBodyContent(entry, {
      navLinks: publicPageManifest.navLinks,
    }).replace("<!-- public:tool -->", '<div id="root"></div>');
    const rootElement = document.getElementById("root")!;
    const intro = document.getElementById("public-page-intro");
    const root = render(<p>Interactive tool</p>, { container: rootElement });
    expect(document.getElementById("public-page-intro")).toBe(intro);
    expect(document.querySelector("h1")?.closest("#root, noscript")).toBeNull();
    expect(
      document.querySelectorAll("#public-page-details a[href]").length,
    ).toBeGreaterThan(50);
    updatePublicPage("/merge", publicPageManifest);
    expect(document.getElementById("root")).toBe(rootElement);
    expect(rootElement.textContent).toBe("Interactive tool");
    expect(document.querySelector("h1")?.textContent).toContain("Merge");
    root.unmount();
  });

  it("updates robots, canonical, social data and schema across public and auth routes", () => {
    installShell();
    updatePublicPage("/compress-pdf", publicPageManifest);
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://stirling.com/app/compress");
    updatePublicPage("/login", publicPageManifest);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, follow");
    expect(document.querySelector("[data-public-page-schema]")).toBeNull();
    expect(document.querySelector("#public-page-intro")).toBeNull();
    expect(document.body.hasAttribute("data-public-page")).toBe(false);
    updatePublicPage("/merge/", publicPageManifest);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("index, follow");
    expect(
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content"),
    ).toBe("https://stirling.com/app/merge");
    expect(document.querySelectorAll("[data-public-page-schema]")).toHaveLength(
      1,
    );
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it("marks unknown routes noindex without canonicalising them to the home page", () => {
    installShell();
    updatePublicPage("/this-page-does-not-exist", publicPageManifest);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, follow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("keeps previews noindex after navigation", () => {
    installShell(true);
    updatePublicPage("/merge", publicPageManifest);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, follow");
  });

  it("leaves self-hosted pages to their existing metadata hooks", () => {
    document.head.innerHTML = "<title>My installation</title>";
    updatePublicPage("/compress", publicPageManifest);
    expect(document.title).toBe("My installation");
    expect(document.querySelector("#public-page-intro")).toBeNull();
  });

  it("replaces static schema instead of accumulating stale route data", () => {
    installShell();
    document.head.insertAdjacentHTML(
      "beforeend",
      injectOg(
        '<head><title></title><meta name="description" /></head>',
        publicPageManifest.byTool.compress,
        { canonicalBase: "https://stirling.com/app", pageUrlPath: "/compress" },
      ),
    );
    updatePublicPage("/merge", publicPageManifest);
    expect(document.querySelectorAll("[data-public-page-schema]")).toHaveLength(
      1,
    );
    expect(
      document.querySelector("[data-public-page-schema]")?.textContent,
    ).toContain("https://stirling.com/app/merge");
  });
});
