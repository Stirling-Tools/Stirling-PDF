import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@editor/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const h = vi.hoisted<{
  auth: { session: unknown; isAnonymous: boolean };
  config: Record<string, unknown> | null;
}>(() => ({ auth: { session: null, isAnonymous: false }, config: null }));

vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => h.auth }));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: h.config }),
}));

import { GuestSignInCard } from "@editor/components/shared/config/configSections/preferences/GuestSignInCard";

const guestSession = {
  user: { id: "anonymous", is_anonymous: true },
  access_token: "",
};

beforeEach(() => {
  h.auth = { session: guestSession, isAnonymous: true };
  h.config = { enableLogin: true, allowAnonymousAccess: true };
});

describe("GuestSignInCard", () => {
  it("offers the sign-in to a guest and names what it unlocks", () => {
    render(<GuestSignInCard />);
    expect(
      screen.getByText("You are using M13A as a guest"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in as administrator" }),
    ).toBeInTheDocument();
  });

  it("walks the whole page to /login rather than routing inside the app", async () => {
    // /login lives outside the app frame and has to boot the login page's own
    // providers, so this is one deliberate full navigation.
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });

    render(<GuestSignInCard />);
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in as administrator" }),
    );
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("/login"));

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("renders nothing when the server does not admit guests", () => {
    h.config = { enableLogin: true, allowAnonymousAccess: false };
    const { container } = render(<GuestSignInCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a signed-in user", () => {
    h.auth = { session: { user: { id: "1" } }, isAnonymous: false };
    const { container } = render(<GuestSignInCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
