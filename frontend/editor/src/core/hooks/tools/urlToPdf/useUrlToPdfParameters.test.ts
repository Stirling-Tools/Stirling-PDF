import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useUrlToPdfParameters,
  defaultParameters,
  isSupportedUrl,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfParameters";

describe("isSupportedUrl", () => {
  test.each([
    "https://example.com",
    "http://example.com/a/b?c=d",
    "https://example.com:8443/report",
    "  https://example.com  ",
  ])("accepts %s", (value) => {
    expect(isSupportedUrl(value)).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["no scheme", "example.com"],
    ["file scheme", "file:///etc/passwd"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<h1>hi</h1>"],
    ["scheme only", "https://"],
  ])("rejects %s", (_label, value) => {
    expect(isSupportedUrl(value)).toBe(false);
  });
});

describe("useUrlToPdfParameters", () => {
  test("starts empty and invalid", () => {
    const { result } = renderHook(() => useUrlToPdfParameters());

    expect(result.current.parameters).toEqual(defaultParameters);
    expect(result.current.validateParameters()).toBe(false);
  });

  test("becomes valid once a full address is entered", () => {
    const { result } = renderHook(() => useUrlToPdfParameters());

    act(() => {
      result.current.updateParameter("urlInput", "example.com");
    });
    expect(result.current.validateParameters()).toBe(false);

    act(() => {
      result.current.updateParameter("urlInput", "https://example.com");
    });
    expect(result.current.validateParameters()).toBe(true);
  });

  test("reports the endpoint the availability check is keyed on", () => {
    const { result } = renderHook(() => useUrlToPdfParameters());

    expect(result.current.getEndpointName()).toBe("url-to-pdf");
  });
});
