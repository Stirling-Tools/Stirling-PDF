import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { preferencesService } from "@editor/services/preferencesService";
import { FeedbackTag } from "@editor/components/feedback/FeedbackTag";

const openFeedback = vi.fn();

vi.mock("@editor/hooks/useOpenFeedback", () => ({
  useOpenFeedback: () => openFeedback,
}));

vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsPhone: () => false,
}));

function renderTag(enableFeedback: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppConfigProvider autoFetch={false} initialConfig={{ enableFeedback }}>
        <PreferencesProvider>
          <FeedbackTag />
        </PreferencesProvider>
      </AppConfigProvider>
    </QueryClientProvider>,
  );
}

describe("FeedbackTag", () => {
  beforeEach(() => {
    localStorage.clear();
    openFeedback.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("opens feedback when clicked", () => {
    renderTag(true);
    fireEvent.click(screen.getByRole("button", { name: "feedback.tag.label" }));
    expect(openFeedback).toHaveBeenCalledOnce();
  });

  it("renders nothing when the server has turned feedback off", () => {
    const { container } = renderTag(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden after being dismissed", () => {
    const { unmount } = renderTag(true);
    fireEvent.click(
      screen.getByRole("button", { name: "feedback.tag.dismiss" }),
    );
    expect(
      screen.queryByRole("button", { name: "feedback.tag.label" }),
    ).toBeNull();
    expect(preferencesService.getPreference("hasDismissedFeedbackTag")).toBe(
      true,
    );

    unmount();
    const { container } = renderTag(true);
    expect(container).toBeEmptyDOMElement();
  });
});
