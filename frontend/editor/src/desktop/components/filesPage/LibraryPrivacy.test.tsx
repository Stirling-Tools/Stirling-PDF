import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, test, vi } from "vitest";
vi.mock("@app/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => true,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
import { LibraryTabs } from "@app/components/filesPage/LibraryTabs";
import { SignMenu } from "@app/components/shared/signing/SignMenu";

test("keeps local files accessible without offering Stirling library or shared files", () => {
  render(
    <MantineProvider>
      <LibraryTabs
        currentTab="recent"
        onChange={() => {}}
        onOpenRoot={() => {}}
        sharingEnabled
      />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "Local files" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recents" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Stirling library" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Shared with you" })).toBeNull();
});

test("hides shared signing while retaining local personal signing", () => {
  const select = vi.fn();
  render(
    <SignMenu
      opened
      onClose={() => {}}
      onSelect={select}
      onOpenSigning={() => {}}
      reasons={{}}
      items={[]}
    >
      <button>Sign</button>
    </SignMenu>,
  );
  expect(
    screen.queryByRole("button", { name: "Request signatures" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Personal signature/ }));
  expect(select).toHaveBeenCalledWith("sign");
});
