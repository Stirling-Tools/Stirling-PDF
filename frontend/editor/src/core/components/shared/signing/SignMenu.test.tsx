import { fireEvent, render, screen } from "@testing-library/react";

import { expect, it, vi } from "vitest";
import { SignMenu } from "@app/components/shared/signing/SignMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

it("keeps personal signing accessible when the server disables shared signing", () => {
  const onSelect = vi.fn();
  render(
    <>
      <SignMenu
        opened
        onClose={vi.fn()}
        onSelect={onSelect}
        reasons={{ sharedSign: "Disabled on this server" }}
        badge={0}
      >
        <button>Sign</button>
      </SignMenu>
    </>,
  );
  expect(
    screen.getByRole("menuitem", { name: "Request signatures" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Draw, type or upload a signature" }),
  );
  expect(onSelect).toHaveBeenCalledWith("sign", false);
});

it("opens request creation directly and provides a separate sessions entry", () => {
  const onSelect = vi.fn();
  render(
    <>
      <SignMenu
        opened
        onClose={vi.fn()}
        onSelect={onSelect}
        reasons={{}}
        badge={2}
      >
        <button>Sign</button>
      </SignMenu>
    </>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Request signatures" }));
  expect(onSelect).toHaveBeenCalledWith("sharedSign", true);
  fireEvent.click(screen.getByRole("menuitem", { name: /Signing sessions/ }));
  expect(onSelect).toHaveBeenCalledWith("sharedSign", false);
});
