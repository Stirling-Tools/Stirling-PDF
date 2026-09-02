import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
  APP_SWITCH_BINDING,
  useAppSwitchShortcut,
  type AppSwitchTarget,
} from "@app/components/shared/AppSwitch";

const onSwitch = vi.fn();

function Harness({
  current = "editor",
  enabled = true,
}: {
  current?: AppSwitchTarget;
  enabled?: boolean;
}) {
  useAppSwitchShortcut(current, onSwitch, enabled);
  return null;
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

describe("app-switch shortcut", () => {
  beforeEach(() => {
    onSwitch.mockClear();
  });

  test("switches to the other app - it is a toggle, not a per-app key", () => {
    const { unmount } = render(<Harness current="editor" />);
    pressSwitchKey();
    expect(onSwitch).toHaveBeenCalledWith("processor");

    unmount();
    onSwitch.mockClear();
    render(<Harness current="processor" />);
    pressSwitchKey();
    expect(onSwitch).toHaveBeenCalledWith("editor");
  });

  test("ignores the combo without its modifiers", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { code: APP_SWITCH_BINDING.code });
    expect(onSwitch).not.toHaveBeenCalled();
  });

  test("stays unbound where the switch is not offered", () => {
    render(<Harness enabled={false} />);
    pressSwitchKey();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  test("leaves the key to text fields", () => {
    render(<Harness />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    pressSwitchKey(input);
    expect(onSwitch).not.toHaveBeenCalled();
    input.remove();
  });

  test("leaves the key to whatever modal owns the screen", () => {
    render(<Harness />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = dialog.appendChild(document.createElement("button"));
    document.body.appendChild(dialog);
    pressSwitchKey(button);
    expect(onSwitch).not.toHaveBeenCalled();
    dialog.remove();
  });

  test("stops listening once the host is gone", () => {
    render(<Harness />).unmount();
    pressSwitchKey();
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
