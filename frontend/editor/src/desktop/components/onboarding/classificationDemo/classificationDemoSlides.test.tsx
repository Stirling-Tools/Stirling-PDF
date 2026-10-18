import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Before the folder has been listed there is no count to show. The line under the hero
// must say what the sweep is doing instead of "0 of 0", and never claim a step that is
// not the current phase's work.

vi.mock("react-i18next", () => ({
  // Imported by the app's i18n bootstrap, which this component's imports reach.
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>,
    ) =>
      fallback.replace(/{{(\w+)}}/g, (_, name: string) =>
        String(values?.[name] ?? ""),
      ),
  }),
}));

import { ProcessingCounts } from "@app/components/onboarding/classificationDemo/classificationDemoSlides";
import type { ClassificationDemoProgress } from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

const progress = (
  over: Partial<ClassificationDemoProgress>,
): ClassificationDemoProgress => ({
  phase: "gathering",
  processed: 0,
  total: 0,
  groups: [],
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProcessingCounts", () => {
  test("never shows a count of nothing before the batch is known", () => {
    const view = render(<ProcessingCounts progress={progress({})} />);
    expect(view.container.textContent).not.toContain("0 of 0");
    expect(view.container.textContent).toContain("Listing the files");
  });

  test("rotates through the phase's status lines and carries the live figure", () => {
    const view = render(
      <ProcessingCounts
        progress={progress({ listing: { checked: 96, total: 212 } })}
      />,
    );
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.textContent).toBe("Checked 96 of 212 files...");
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.textContent).toContain("most recent PDFs");
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.textContent).toContain("Listing the files");
  });

  test("mounting the folder has its own lines", () => {
    const view = render(
      <ProcessingCounts progress={progress({ phase: "reading" })} />,
    );
    expect(view.container.textContent).toContain("Connecting your Downloads");
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.textContent).toContain("file library");
  });

  test("shows the running count once the batch is known", () => {
    const view = render(
      <ProcessingCounts
        progress={progress({ phase: "processing", processed: 17, total: 50 })}
      />,
    );
    expect(view.container.textContent).toBe("17of 50 PDFs processed");
  });
});
