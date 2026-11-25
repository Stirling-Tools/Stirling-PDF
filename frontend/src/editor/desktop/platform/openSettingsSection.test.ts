import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ask: vi.fn(), navigate: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: h.ask }));
vi.mock("@editor/utils/settingsNavigation", () => ({
  navigateToSettings: h.navigate,
}));

import { openSettingsSection } from "@editor/platform/openSettingsSection";

beforeEach(() => {
  h.ask.mockReset();
  h.navigate.mockReset();
});

it("opens the section once the user agrees to leave the draft", async () => {
  h.ask.mockResolvedValue(true);
  openSettingsSection("adminFolderAccess");
  await vi.waitFor(() =>
    expect(h.navigate).toHaveBeenCalledWith("adminFolderAccess"),
  );
});

it("stays with the draft when the user says so", async () => {
  h.ask.mockResolvedValue(false);
  openSettingsSection("adminFolderAccess");
  await vi.waitFor(() => expect(h.ask).toHaveBeenCalled());
  await Promise.resolve();
  expect(h.navigate).not.toHaveBeenCalled();
});
