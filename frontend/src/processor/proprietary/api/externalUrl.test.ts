import { describe, expect, it, vi, afterEach } from "vitest";
import { openApiUrl } from "@portal/api/externalUrl";

function spyOpen() {
  return vi.spyOn(window, "open").mockImplementation(() => null);
}

afterEach(() => vi.restoreAllMocks());

describe("openApiUrl", () => {
  it("opens an https URL in a new tab with noopener", () => {
    const open = spyOpen();
    openApiUrl("https://invoice.stripe.com/i/abc123");
    expect(open).toHaveBeenCalledWith(
      "https://invoice.stripe.com/i/abc123",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens a relative URL by resolving it against the origin", () => {
    const open = spyOpen();
    openApiUrl("/invoices/abc.pdf");
    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/invoices/abc.pdf`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  // The reason this module exists: a navigation sink must not evaluate script.
  it.each([
    "javascript:alert(document.domain)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("refuses %s", (hostile) => {
    const open = spyOpen();
    openApiUrl(hostile);
    expect(open).not.toHaveBeenCalled();
  });

  it("does nothing for an empty or missing URL", () => {
    const open = spyOpen();
    openApiUrl(null);
    openApiUrl(undefined);
    openApiUrl("");
    expect(open).not.toHaveBeenCalled();
  });
});
