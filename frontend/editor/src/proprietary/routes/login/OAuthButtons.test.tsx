import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import OAuthButtons from "@shared/auth/ui/OAuthButtons";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("OAuthButtons", () => {
  const mockOnProviderClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render known providers with correct labels", () => {
    const enabledProviders = ["google", "github", "authentik"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // Check that known providers are rendered with their labels
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Authentik")).toBeTruthy();
  });

  it("should render unknown provider with capitalized label and generic icon", () => {
    // Render the unknown provider alongside oidc so we can assert the unknown
    // one falls back to the same (generic OIDC) icon. Icons are bundled assets,
    // so we compare resolved srcs rather than filenames.
    const enabledProviders = ["mycompany", "oidc"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // Unknown provider should be capitalized
    expect(screen.getByText("Mycompany")).toBeTruthy();

    // Unknown provider falls back to the generic OIDC icon
    const mycompanyImg = screen
      .getByText("Mycompany")
      .closest("button")
      ?.querySelector("img");
    const oidcImg = screen
      .getByText("OIDC")
      .closest("button")
      ?.querySelector("img");
    expect(mycompanyImg?.src).toBeTruthy();
    expect(mycompanyImg?.src).toBe(oidcImg?.src);
  });

  it('should call onProviderClick with actual provider ID (not "oidc")', async () => {
    const user = userEvent.setup();
    const enabledProviders = ["mycompany"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    const button = screen.getByText("Mycompany");
    await user.click(button);

    // Should use actual provider ID 'mycompany', NOT 'oidc'
    expect(mockOnProviderClick).toHaveBeenCalledWith("mycompany");
  });

  it('should call onProviderClick with "authentik" when authentik is clicked', async () => {
    const user = userEvent.setup();
    const enabledProviders = ["authentik"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    const button = screen.getByText("Authentik");
    await user.click(button);

    expect(mockOnProviderClick).toHaveBeenCalledWith("authentik");
  });

  it('should call onProviderClick with "oidc" when OIDC is explicitly configured', async () => {
    const user = userEvent.setup();
    const enabledProviders = ["oidc"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    const button = screen.getByText("OIDC");
    await user.click(button);

    expect(mockOnProviderClick).toHaveBeenCalledWith("oidc");
  });

  it("should disable buttons when isSubmitting is true", () => {
    const enabledProviders = ["google", "github"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={true}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    const googleButton = screen
      .getByText("Google")
      .closest("button") as HTMLButtonElement;
    const githubButton = screen
      .getByText("GitHub")
      .closest("button") as HTMLButtonElement;

    expect(googleButton.disabled).toBe(true);
    expect(githubButton.disabled).toBe(true);
  });

  it("should render nothing when no providers are enabled", () => {
    const { container } = render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={[]}
        />
      </TestWrapper>,
    );

    // Should render null/nothing (excluding Mantine's style tags)
    const hasContent = Array.from(container.children).some(
      (child) => child.tagName.toLowerCase() !== "style",
    );
    expect(hasContent).toBe(false);
  });

  it("should render multiple unknown providers with correct IDs", async () => {
    const user = userEvent.setup();
    const enabledProviders = ["company1", "company2", "company3"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // All should be capitalized
    expect(screen.getByText("Company1")).toBeTruthy();
    expect(screen.getByText("Company2")).toBeTruthy();
    expect(screen.getByText("Company3")).toBeTruthy();

    // Click each and verify correct ID is passed
    await user.click(screen.getByText("Company1"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("company1");

    await user.click(screen.getByText("Company2"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("company2");

    await user.click(screen.getByText("Company3"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("company3");
  });

  it("should use correct icon for known providers", () => {
    const enabledProviders = ["google", "github", "authentik", "keycloak"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // Each known provider renders an icon, and the icons are distinct. Icons
    // are bundled assets (data URI / hashed URL), so assert distinctness rather
    // than matching filenames.
    const srcOf = (label: string) =>
      screen.getByText(label).closest("button")?.querySelector("img")?.src;
    const srcs = [
      srcOf("Google"),
      srcOf("GitHub"),
      srcOf("Authentik"),
      srcOf("Keycloak"),
    ];
    srcs.forEach((src) => expect(src).toBeTruthy());
    expect(new Set(srcs).size).toBe(4);
  });

  it("should handle mixed known and unknown providers", async () => {
    const user = userEvent.setup();
    const enabledProviders = ["google", "mycompany", "authentik", "custom"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // Known providers with correct labels
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("Authentik")).toBeTruthy();

    // Unknown providers with capitalized labels
    expect(screen.getByText("Mycompany")).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();

    // Click each and verify IDs are preserved
    await user.click(screen.getByText("Google"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("google");

    await user.click(screen.getByText("Mycompany"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("mycompany");

    await user.click(screen.getByText("Authentik"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("authentik");

    await user.click(screen.getByText("Custom"));
    expect(mockOnProviderClick).toHaveBeenCalledWith("custom");
  });

  it("should maintain provider ID consistency - critical for OAuth redirect", async () => {
    const user = userEvent.setup();

    // This test ensures the fix for GitHub issue #5141
    // The provider ID used in the button click MUST match the backend registration ID
    // Previously, unknown providers were mapped to 'oidc', breaking the OAuth flow

    const enabledProviders = ["authentik", "okta", "auth0"];

    render(
      <TestWrapper>
        <OAuthButtons
          onProviderClick={mockOnProviderClick}
          isSubmitting={false}
          enabledProviders={enabledProviders}
        />
      </TestWrapper>,
    );

    // Each provider should use its actual ID, not 'oidc'
    await user.click(screen.getByText("Authentik"));
    expect(mockOnProviderClick).toHaveBeenLastCalledWith("authentik");

    await user.click(screen.getByText("Okta"));
    expect(mockOnProviderClick).toHaveBeenLastCalledWith("okta");

    await user.click(screen.getByText("Auth0"));
    expect(mockOnProviderClick).toHaveBeenLastCalledWith("auth0");

    // Verify none were called with 'oidc' instead of their actual ID
    expect(mockOnProviderClick).not.toHaveBeenCalledWith("oidc");
  });
});
