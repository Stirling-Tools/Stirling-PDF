import { describe, expect, it, vi } from "vitest";
import { CanceledError } from "axios";
import { alert } from "@editor/components/toast";
import { handleHttpError } from "@editor/services/httpErrorHandler";

vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));

describe("handleHttpError", () => {
  it("shows nothing for a request the caller aborted", async () => {
    await expect(handleHttpError(new CanceledError())).resolves.toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });
});
