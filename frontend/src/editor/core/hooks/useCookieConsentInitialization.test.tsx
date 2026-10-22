import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCookieConsentInitialization } from "@app/hooks/useCookieConsentInitialization";
import { useCookieConsent } from "@app/hooks/useCookieConsent";
import { TOUR_STATE_EVENT } from "@app/constants/events";

const h = vi.hoisted(() => ({
  config: { enableAnalytics: false, enablePosthog: true, enableScarf: true },
  translate: (key: string) => key,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: h.config }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: h.translate }),
}));

const scripts = () =>
  document.querySelectorAll('script[src$="cookieconsent.umd.js"]');

describe("cookie consent lifecycle", () => {
  afterEach(cleanup);

  it("does not initialize from preference readers or when analytics is disabled", () => {
    renderHook(() => useCookieConsent());
    renderHook(() => useCookieConsentInitialization());
    expect(scripts()).toHaveLength(0);
  });

  it("shares loading across apps, preserves consent, and hides on leaving the app", async () => {
    h.config.enableAnalytics = true;
    const editor = renderHook(() => useCookieConsentInitialization(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      ),
    });
    expect(scripts()).toHaveLength(1);
    editor.unmount();
    const processor = renderHook(() => useCookieConsentInitialization());
    expect(scripts()).toHaveLength(1);

    const consent = {
      run: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      showPreferences: vi.fn(),
      hidePreferences: vi.fn(),
      getCookie: vi.fn<() => unknown>(() => ({})),
      acceptedCategory: vi.fn(() => false),
      acceptedService: vi.fn(() => false),
    };
    window.CookieConsent = consent;
    await act(async () => {
      scripts()[0].dispatchEvent(new Event("load"));
    });
    await waitFor(() => expect(consent.show).toHaveBeenCalledTimes(1));
    expect(consent.run).toHaveBeenCalledTimes(1);
    expect(consent.run).toHaveBeenCalledWith(
      expect.objectContaining({ autoShow: false }),
    );
    expect(document.querySelectorAll("link[data-cookie-consent]")).toHaveLength(
      2,
    );

    const reader = renderHook(() => useCookieConsent());
    act(() => reader.result.current.showCookiePreferences());
    expect(consent.showPreferences).toHaveBeenCalledTimes(1);

    act(() =>
      window.dispatchEvent(
        new CustomEvent(TOUR_STATE_EVENT, { detail: { isOpen: true } }),
      ),
    );
    expect(consent.hide).toHaveBeenCalled();
    consent.show.mockClear();
    act(() =>
      window.dispatchEvent(
        new CustomEvent(TOUR_STATE_EVENT, { detail: { isOpen: false } }),
      ),
    );
    expect(consent.show).toHaveBeenCalledTimes(1);

    consent.getCookie.mockReturnValue({ categories: ["necessary"] });
    processor.unmount();
    consent.show.mockClear();
    consent.hide.mockClear();
    const nextEntry = renderHook(() => useCookieConsentInitialization());
    await act(async () => {});
    expect(consent.run).toHaveBeenCalledTimes(1);
    expect(consent.show).not.toHaveBeenCalled();

    act(() =>
      document.documentElement.setAttribute(
        "data-mantine-color-scheme",
        "dark",
      ),
    );
    await waitFor(() =>
      expect(document.documentElement).toHaveClass("cc--darkmode"),
    );
    h.config.enableAnalytics = false;
    nextEntry.rerender();
    expect(consent.hide).toHaveBeenCalled();
    expect(consent.hidePreferences).toHaveBeenCalled();
    consent.hide.mockClear();
    nextEntry.unmount();
    expect(consent.hide).toHaveBeenCalled();
  });
});
