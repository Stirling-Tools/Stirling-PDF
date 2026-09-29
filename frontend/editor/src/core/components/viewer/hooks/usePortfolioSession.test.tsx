import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePortfolioSession } from "@app/components/viewer/hooks/usePortfolioSession";

const readPortfolioMembers = vi.hoisted(() => vi.fn());

vi.mock("@app/utils/portfolioMembers", () => ({
  readPortfolioMembers,
}));

const member = { index: 0, name: "note.txt" };

describe("usePortfolioSession", () => {
  beforeEach(() => {
    readPortfolioMembers.mockReset();
    readPortfolioMembers.mockResolvedValue([member]);
  });

  it("reads members from a PDF", async () => {
    const file = new File(["%PDF-1.7"], "portfolio.pdf", {
      type: "application/pdf",
    });

    const { result } = renderHook(() => usePortfolioSession(file));

    await waitFor(() => expect(result.current.session?.file).toBe(file));
    expect(readPortfolioMembers).toHaveBeenCalledWith(file);
  });

  it("never parses a file that is not a PDF", async () => {
    const file = new File(["not a pdf"], "member.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const { result } = renderHook(() => usePortfolioSession(file));

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(readPortfolioMembers).not.toHaveBeenCalled();
  });

  it("keeps the portfolio pinned while a non-PDF member is on screen", async () => {
    const portfolio = new File(["%PDF-1.7"], "portfolio.pdf", {
      type: "application/pdf",
    });
    const { result, rerender } = renderHook(
      ({ file }: { file: File }) => usePortfolioSession(file),
      { initialProps: { file: portfolio } },
    );
    await waitFor(() => expect(result.current.session?.file).toBe(portfolio));

    rerender({ file: new File(["x"], "note.txt", { type: "text/plain" }) });

    await waitFor(() =>
      expect(result.current.activeMemberName).toBe("note.txt"),
    );
    expect(result.current.session?.file).toBe(portfolio);
  });
});
