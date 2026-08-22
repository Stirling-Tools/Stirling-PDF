import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { APP_SWITCH_BINDING } from "@app/components/shared/AppSwitch";

vi.mock("@app/routes/adminRouteExtensions", () => ({
  getAdminRouteExtensions: () => [],
  preloadAdminRoutes: () => Promise.resolve(),
}));

const onSwitch = vi.fn();

function mount(current: "editor" | "processor" = "editor") {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <BrandSwitcher current={current} onSwitch={onSwitch} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** Presses the real binding, so the test tracks whatever it is set to. */
function pressSwitchKey(target: Element | Document = document) {
  fireEvent.keyDown(target, {
    code: APP_SWITCH_BINDING.code,
    altKey: Boolean(APP_SWITCH_BINDING.alt),
    ctrlKey: Boolean(APP_SWITCH_BINDING.ctrl),
    metaKey: Boolean(APP_SWITCH_BINDING.meta),
    shiftKey: Boolean(APP_SWITCH_BINDING.shift),
  });
}

describe("BrandSwitcher app-switch shortcut", () => {
  beforeEach(() => {
    onSwitch.mockClear();
  });

  test("switches to the other app - it is a toggle, not a per-app key", () => {
    const { unmount } = mount("editor");
    pressSwitchKey();
    expect(onSwitch).toHaveBeenCalledWith("processor");

    unmount();
    onSwitch.mockClear();
    mount("processor");
    pressSwitchKey();
    expect(onSwitch).toHaveBeenCalledWith("editor");
  });

  test("ignores the combo without its modifiers", () => {
    mount();
    fireEvent.keyDown(document, { code: APP_SWITCH_BINDING.code });
    expect(onSwitch).not.toHaveBeenCalled();
  });

  test("leaves the key to text fields", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    pressSwitchKey(input);
    expect(onSwitch).not.toHaveBeenCalled();
    input.remove();
  });

  test("leaves the key to whatever modal owns the screen", () => {
    mount();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = dialog.appendChild(document.createElement("button"));
    document.body.appendChild(dialog);
    pressSwitchKey(button);
    expect(onSwitch).not.toHaveBeenCalled();
    dialog.remove();
  });

  test("stops listening once the switcher is gone", () => {
    mount().unmount();
    pressSwitchKey();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  test("advertises the shortcut on the app the key leads to", () => {
    // Mantine's open transition schedules a state update. Run it out here under
    // fake timers, including past unmount: left pending it fires after the test
    // environment is torn down and surfaces as an unhandled "window is not
    // defined" attributed to whichever file happens to be running then.
    vi.useFakeTimers();
    try {
      const { unmount } = mount("editor");
      fireEvent.click(
        document.querySelector(".sui-brand-switcher__trigger") as HTMLElement,
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // One hint only: the current app is not somewhere the key can take you.
      const hints = document.querySelectorAll(".sui-app-switch__keys");
      expect(hints).toHaveLength(1);
      expect(hints[0].textContent).toContain("S");

      unmount();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
