import {
  describe,
  expect,
  test,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  PreferencesProvider,
  usePreferences,
} from "@app/contexts/PreferencesContext";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { allowConsole } from "@app/tests/failOnConsole";
import {
  MAX_SHORT_NAME_CODE_POINTS,
  resolveAppName,
  truncateShortName,
  mergeManifestName,
  absolutizeManifestUrls,
  useManifestUrl,
  type StaticManifest,
} from "@app/hooks/useManifestUrl";

const MODERN_MANIFEST: StaticManifest = {
  short_name: "Stirling PDF",
  name: "Stirling PDF",
  icons: [
    {
      src: "modern-logo/favicon.ico",
      sizes: "64x64 32x32 24x24 16x16",
      type: "image/x-icon",
    },
    { src: "modern-logo/logo192.png", type: "image/png", sizes: "192x192" },
    { src: "modern-logo/logo512.png", type: "image/png", sizes: "512x512" },
  ],
  start_url: ".",
  display: "standalone",
  theme_color: "#000000",
  background_color: "#ffffff",
};

const CLASSIC_MANIFEST: StaticManifest = {
  ...MODERN_MANIFEST,
  icons: [
    {
      src: "classic-logo/favicon.ico",
      sizes: "64x64 32x32 24x24 16x16",
      type: "image/x-icon",
    },
    { src: "classic-logo/logo192.png", type: "image/png", sizes: "192x192" },
    { src: "classic-logo/logo512.png", type: "image/png", sizes: "512x512" },
  ],
};

/** Test double so each scenario can set its own appName. */
function ConfigHarness({
  appName,
  children,
}: {
  appName: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <TestQueryProvider>
      <PreferencesProvider>
        <AppConfigProvider
          bootstrapMode="non-blocking"
          autoFetch={false}
          initialConfig={
            appName == null
              ? { enableLogin: false }
              : { enableLogin: false, appNameNavbar: appName }
          }
        >
          {children}
        </AppConfigProvider>
      </PreferencesProvider>
    </TestQueryProvider>
  );
}

function renderUseManifestUrl(options?: {
  wrapper?: (props: { children: ReactNode }) => ReactNode;
}) {
  return renderHook(() => useManifestUrl(), options);
}

/**
 * jsdom's Blob has no .text(); setupTests mocks Blob.prototype.arrayBuffer
 * with a dummy buffer, so read the content through FileReader instead.
 */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Parse the most recently created blob as the merged manifest. */
async function readBlobManifest(
  createObjectURLSpy: MockInstance<typeof URL.createObjectURL>,
): Promise<StaticManifest> {
  const blob = createObjectURLSpy.mock.calls.at(-1)?.[0] as Blob;
  return JSON.parse(await readBlobText(blob)) as StaticManifest;
}

describe("resolveAppName", () => {
  test("treats undefined, null, empty and whitespace-only as unset", () => {
    expect(resolveAppName(undefined)).toBeNull();
    expect(resolveAppName(null)).toBeNull();
    expect(resolveAppName("")).toBeNull();
    expect(resolveAppName("   ")).toBeNull();
    expect(resolveAppName("\t\n ")).toBeNull();
  });

  test("returns the trimmed name when set", () => {
    expect(resolveAppName("Acme Docs")).toBe("Acme Docs");
    expect(resolveAppName("  Acme Docs  ")).toBe("Acme Docs");
  });
});

describe("truncateShortName", () => {
  test("keeps the full name when at most 12 code points (T4)", () => {
    expect(truncateShortName("Acme Docs")).toBe("Acme Docs");
    expect(truncateShortName("123456789012")).toBe("123456789012");
  });

  test("truncates to 11 code points plus ellipsis when longer (T3)", () => {
    const long = "A Very Long Product Name That Exceeds Twelve";
    const truncated = truncateShortName(long);
    expect(truncated).toBe("A Very Long\u2026");
    expect(Array.from(truncated).length).toBe(MAX_SHORT_NAME_CODE_POINTS);
    expect(truncated.endsWith("\u2026")).toBe(true);
  });

  test("is surrogate-pair-safe for emoji / non-Latin names (T4b)", () => {
    // 12 emoji: each is a surrogate pair; slicing code units would mojibake.
    const twelveEmoji =
      "\u{1F600}\u{1F601}\u{1F602}\u{1F603}\u{1F604}\u{1F605}\u{1F606}\u{1F607}\u{1F608}\u{1F609}\u{1F60A}\u{1F60B}";
    expect(truncateShortName(twelveEmoji)).toBe(twelveEmoji);
    const thirteenEmoji = twelveEmoji + "\u{1F60C}";
    const truncated = truncateShortName(thirteenEmoji);
    expect(Array.from(truncated).length).toBe(MAX_SHORT_NAME_CODE_POINTS);
    expect(truncated.endsWith("\u2026")).toBe(true);
    // No lone surrogate halves survive the truncation (the ellipsis itself is
    // a single code unit and is expected).
    for (const codePoint of Array.from(truncated)) {
      const code = codePoint.codePointAt(0)!;
      if (codePoint !== "\u2026") {
        expect(code).toBeGreaterThan(0xffff);
      }
    }
  });
});

describe("mergeManifestName", () => {
  test("returns the static manifest unchanged when appName is unset (R2)", () => {
    expect(mergeManifestName(MODERN_MANIFEST, null)).toBe(MODERN_MANIFEST);
  });

  test("merges name and truncated short_name when appName is set (R1/R5)", () => {
    const merged = mergeManifestName(
      MODERN_MANIFEST,
      "A Very Long Product Name That Exceeds Twelve",
    );
    expect(merged.name).toBe("A Very Long Product Name That Exceeds Twelve");
    expect(merged.short_name).toBe("A Very Long\u2026");
    expect(merged.start_url).toBe(".");
  });
});

describe("absolutizeManifestUrls", () => {
  const ORIGIN = "https://pdf.example.com/";

  test("rewrites start_url and every icon src to origin-absolute URLs (T6b)", () => {
    const resolved = absolutizeManifestUrls(MODERN_MANIFEST, ORIGIN);
    expect(resolved.start_url).toBe("https://pdf.example.com/");
    for (const icon of resolved.icons ?? []) {
      expect(icon.src).toMatch(/^https:\/\/pdf\.example\.com\//);
      expect(icon.src).not.toMatch(/^(?!https?:)/);
    }
  });

  test("rewrites scope and id when present", () => {
    const withScopeAndId: StaticManifest = {
      ...MODERN_MANIFEST,
      scope: ".",
      id: "./",
    };
    const resolved = absolutizeManifestUrls(withScopeAndId, ORIGIN);
    expect(resolved.scope).toBe("https://pdf.example.com/");
    expect(resolved.id).toBe("https://pdf.example.com/");
  });

  test("leaves already-absolute members untouched", () => {
    const withAbsoluteIcons: StaticManifest = {
      ...MODERN_MANIFEST,
      start_url: "https://cdn.example.com/app",
      icons: [{ src: "https://cdn.example.com/icon.png" }],
    };
    const resolved = absolutizeManifestUrls(withAbsoluteIcons, ORIGIN);
    expect(resolved.start_url).toBe("https://cdn.example.com/app");
    expect(resolved.icons?.[0]?.src).toBe("https://cdn.example.com/icon.png");
  });
});

describe("useManifestUrl", () => {
  let createObjectURLSpy: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectURLSpy: MockInstance<typeof URL.revokeObjectURL>;
  beforeEach(() => {
    createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(
        () => `blob:mock-${Math.random().toString(36).slice(2)}`,
      );
    revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapperFor = (appName: string | null | undefined) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigHarness appName={appName}>{children}</ConfigHarness>
    );
    return wrapper;
  };

  test("T6b: URL members are rewritten against the manifest URL, not the page URL (deep-link safe)", async () => {
    // Page is on a deep route; the manifest lives at the app root. Members
    // must resolve against the manifest's directory, not the deep link.
    Object.defineProperty(window, "location", {
      value: new URL("https://pdf.example.com/share/abc123"),
      writable: true,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MODERN_MANIFEST)),
    );

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });

    await waitFor(() => {
      expect(result.current.manifestHref).toMatch(/^blob:/);
    });

    const manifest = await readBlobManifest(createObjectURLSpy);
    // start_url "." resolves against the manifest URL (/manifest.json) -> app root.
    expect(manifest.start_url).toBe("https://pdf.example.com/");
    for (const icon of manifest.icons ?? []) {
      expect(icon.src).toMatch(/^https:\/\/pdf\.example\.com\/modern-logo\//);
      expect(icon.src).not.toContain("/share/");
    }
  });

  test("T1: returns a blob URL and the blob manifest uses appName", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(MODERN_MANIFEST)));

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });

    await waitFor(() => {
      expect(result.current.manifestHref).toMatch(/^blob:/);
    });

    const manifest = await readBlobManifest(createObjectURLSpy);
    expect(manifest.name).toBe("Acme Docs");
    expect(manifest.short_name).toBe("Acme Docs");
    // URL members must be origin-absolute in the produced blob (T6b).
    expect(manifest.start_url).toMatch(/^https?:\/\//);
    for (const icon of manifest.icons ?? []) {
      expect(icon.src).toMatch(/^https?:\/\//);
    }

    expect(fetchMock).toHaveBeenCalledWith("/manifest.json", {
      signal: expect.any(AbortSignal),
    });
  });

  test("T2: static manifestHref returned unchanged when appName is unset", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(MODERN_MANIFEST)));

    for (const unset of [undefined, null, "", "   "]) {
      const { result } = renderUseManifestUrl({ wrapper: wrapperFor(unset) });
      expect(result.current.manifestHref).toBe("/manifest.json");
      await act(async () => {});
      // No blob is ever created, no fetch is issued.
      expect(result.current.manifestHref).toBe("/manifest.json");
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  test("T3: short_name is first 11 code points + ellipsis when appName > 12", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MODERN_MANIFEST)),
    );

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("A Very Long Product Name That Exceeds Twelve"),
    });

    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    const manifest = await readBlobManifest(createObjectURLSpy);
    expect(manifest.name).toBe("A Very Long Product Name That Exceeds Twelve");
    expect(manifest.short_name).toBe("A Very Long\u2026");
    expect(Array.from(manifest.short_name!).length).toBe(
      MAX_SHORT_NAME_CODE_POINTS,
    );
  });

  test("T4: short_name is the full appName when at most 12 code points", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MODERN_MANIFEST)),
    );

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });

    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    const manifest = await readBlobManifest(createObjectURLSpy);
    expect(manifest.short_name).toBe("Acme Docs");
  });

  test("T4b: surrogate-pair-safe truncation end-to-end", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MODERN_MANIFEST)),
    );

    const longEmoji =
      "\u{1F600}\u{1F601}\u{1F602}\u{1F603}\u{1F604}\u{1F605}\u{1F606}\u{1F607}\u{1F608}\u{1F609}\u{1F60A}\u{1F60B}\u{1F60C}";
    const { result } = renderUseManifestUrl({ wrapper: wrapperFor(longEmoji) });

    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    const manifest = await readBlobManifest(createObjectURLSpy);
    expect(Array.from(manifest.short_name!).length).toBe(
      MAX_SHORT_NAME_CODE_POINTS,
    );
    expect(manifest.short_name!.endsWith("\u2026")).toBe(true);
  });

  test("T5: changing appName revokes the previous blob URL", async () => {
    // A Response body can only be read once; the hook re-fetches when appName
    // changes, so each call must get a FRESH Response.
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MODERN_MANIFEST))),
    );

    // Driver wrapper lets the test change the seeded appName between renders.
    let setAppName: (value: string) => void = () => {};
    const Driver = ({ children }: { children: ReactNode }) => {
      const [appName, setter] = useState("First Name");
      setAppName = setter;
      return <ConfigHarness appName={appName}>{children}</ConfigHarness>;
    };

    const { result } = renderUseManifestUrl({ wrapper: Driver });
    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    const firstUrl = result.current.manifestHref;
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    act(() => {
      setAppName("Second Name");
    });

    await waitFor(() => {
      expect(result.current.manifestHref).not.toBe(firstUrl);
    });
    await waitFor(() => {
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(firstUrl);
    });

    // The new blob URL itself is not revoked.
    const revocations = revokeObjectURLSpy.mock.calls.map((call) => call[0]);
    expect(revocations).not.toContain(result.current.manifestHref);
  });

  test("T5b: unmount revokes the blob URL (no leaks)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MODERN_MANIFEST)),
    );

    const { result, unmount } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });
    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    const url = result.current.manifestHref;

    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(url);
  });

  test("T6: fetch failure falls back to the static manifestHref", async () => {
    allowConsole.error(/\[useManifestUrl\] Failed to build runtime manifest/);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });

    await waitFor(() => {
      expect(result.current.manifestHref).toBe("/manifest.json");
    });
    // No blob URL was ever created.
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
  });

  test("T9b: keeps the static manifestHref until the hook resolves", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderUseManifestUrl({
      wrapper: wrapperFor("Acme Docs"),
    });

    // In flight: still the static manifest (no transient broken state).
    expect(result.current.manifestHref).toBe("/manifest.json");

    await act(async () => {
      resolveFetch(new Response(JSON.stringify(MODERN_MANIFEST)));
    });
    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
  });

  test("picks manifest-classic.json for the classic logo variant", async () => {
    // Set the preference through the provider seam (a mount effect) rather
    // than writing the raw storage key directly, matching production usage.
    const ClassicWrapper = ({ children }: { children: ReactNode }) => {
      const { updatePreference } = usePreferences();
      useEffect(() => {
        updatePreference("logoVariant", "classic");
      }, [updatePreference]);
      return <>{children}</>;
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(CLASSIC_MANIFEST))),
      );

    const { result } = renderUseManifestUrl({
      // ClassicWrapper sits INSIDE ConfigHarness so usePreferences is
      // available; its mount effect flips the variant before the hook reads it.
      wrapper: (props) => (
        <ConfigHarness appName="Acme Docs">
          <ClassicWrapper>{props.children}</ClassicWrapper>
        </ConfigHarness>
      ),
    });

    await waitFor(() => expect(result.current.manifestHref).toMatch(/^blob:/));
    expect(fetchMock).toHaveBeenCalledWith("/manifest-classic.json", {
      signal: expect.any(AbortSignal),
    });

    const manifest = await readBlobManifest(createObjectURLSpy);
    expect(
      manifest.icons?.some((icon) => icon.src?.includes("classic-logo")),
    ).toBe(true);
  });
});
