import { describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { NavFooter } from "@app/components/shared/navFooter/NavFooter";

/** The footer's tooltips need Mantine's theme context. */
function withProviders(ui: React.ReactNode) {
  return <MantineProvider>{ui}</MantineProvider>;
}

function renderFooter() {
  const { container } = render(
    withProviders(
      <NavFooter
        displayName="admin"
        onOpenSettings={() => {}}
        credits={{ remaining: 247, total: 500 }}
        otherApp={{ app: "processor", onOpen: () => {} }}
      />,
    ),
  );
  return container.querySelector(".nav-footer") as HTMLElement;
}

describe("NavFooter — enter animation", () => {
  it("plays once per page session, not on every remount", () => {
    // The rows are seeded from cache, so they're present at first paint. Every
    // later mount — switching apps, remounting a view — would otherwise replay
    // the fade on content that never changed, which reads as a twitch.
    expect(renderFooter().dataset.animate).toBe("true");
    cleanup();
    expect(renderFooter().dataset.animate).toBeUndefined();
    cleanup();
    expect(renderFooter().dataset.animate).toBeUndefined();
  });
});

describe("NavFooter — separators", () => {
  it("never renders a divider beside a row that renders nothing", () => {
    // Dividers are CSS between adjacent non-empty slots, so an extras element
    // that returns null (the linked org's link-account CTA) can't leave a line.
    const { container } = render(
      withProviders(
        <NavFooter
          displayName="admin"
          onOpenSettings={() => {}}
          credits={null}
          otherApp={null}
          accountExtras={<>{null}</>}
        />,
      ),
    );
    const slots = container.querySelectorAll(".nav-footer__slot");
    const filled = [...slots].filter((s) => s.childElementCount > 0);
    expect(filled).toHaveLength(1);
    expect(container.querySelectorAll(".nav-footer__divider")).toHaveLength(0);
  });
});
