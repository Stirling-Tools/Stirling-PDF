import axios from "axios";
import { describe, expect, it } from "vitest";
import {
  extractAxiosErrorMessage,
  extractAxiosErrorMessageAsync,
} from "@app/services/httpErrorUtils";

function axiosError(data: unknown): unknown {
  return new axios.AxiosError(
    "Request failed",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      config: { headers: {} },
      data,
    } as never,
  );
}

describe("extractAxiosErrorMessageAsync", () => {
  it("reads a JSON message out of a blob error body", async () => {
    const error = axiosError(
      new Blob(
        [JSON.stringify({ message: "The EPUB is password protected." })],
        {
          type: "application/json",
        },
      ),
    );

    await expect(extractAxiosErrorMessageAsync(error)).resolves.toEqual({
      title: "Server error",
      body: "The EPUB is password protected.",
    });
  });

  it("keeps plain-text blob bodies that are not JSON", async () => {
    const error = axiosError(new Blob(["Disk is full"]));

    await expect(extractAxiosErrorMessageAsync(error)).resolves.toEqual({
      title: "Server error",
      body: "Disk is full",
    });
  });

  it("defers to the synchronous extractor for non-blob bodies", async () => {
    const error = axiosError({ message: "Unsupported format" });

    await expect(extractAxiosErrorMessageAsync(error)).resolves.toEqual(
      extractAxiosErrorMessage(error),
    );
  });
});
