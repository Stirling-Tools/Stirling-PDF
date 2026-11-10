import { describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { NavFooter } from "@editor/components/shared/navFooter/NavFooter";

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

describe("NavFooter — guest row", () => {
  function renderGuest() {
    const { container } = render(
      withProviders(
        <NavFooter
          displayName="User"
          guest
          onOpenSettings={() => {}}
          credits={null}
          otherApp={null}
        />,
      ),
    );
    return container;
  }

  it("offers the sign-in instead of an identity", () => {
    // A guest has no name and no picture to draw, so the row is an invitation;
    // it still opens settings, which is where the full offer lives.
    const container = renderGuest();
    const label = container.querySelector(".nav-footer__row-label");
    // The test i18n instance returns keys, not copy: this pins which key the
    // row reads, which is what a translator sees.
    expect(label?.textContent).toBe("guestAccess.signIn");
    expect(container.querySelector(".nav-footer__guest-icon")).not.toBeNull();
    expect(container.querySelector(".mantine-Avatar-root")).toBeNull();
  });

  it("stays a working button that reaches settings", () => {
    const container = renderGuest();
    const button = container.querySelector(
      ".nav-footer__account",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toContain("guestAccess.signIn");
  });
});
