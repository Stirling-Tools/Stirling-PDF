import { Box, Button, Group, Text } from "@mantine/core";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PluginInfo, usePluginRegistry } from "@app/contexts/PluginRegistryContext";

const URL_ATTRIBUTES_TO_NORMALIZE = new Set([
  "src",
  "href",
  "action",
  "poster",
  "formaction",
  "data-src",
  "data-href",
  "data-url",
  "data-background",
  "xlink:href",
  "srcset",
]);

const ABSOLUTE_URL_PATTERN = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#)/;

const resolveRelativeUrl = (value: string, base: string | null): string => {
  if (!value || !base) {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || ABSOLUTE_URL_PATTERN.test(trimmed)) {
    return value;
  }

  try {
    return new URL(trimmed, base).toString();
  } catch {
    return value;
  }
};

const normalizeSrcset = (value: string, base: string | null): string => {
  if (!base) {
    return value;
  }

  return value
    .split(",")
    .map((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) {
        return "";
      }

      const [url, descriptor] = trimmed.split(/\s+/, 2);
      if (!url) {
        return "";
      }

      const resolved = resolveRelativeUrl(url, base);
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    })
    .filter(Boolean)
    .join(", ");
};

const normalizeStyleUrls = (value: string, base: string | null): string => {
  if (!base) {
    return value;
  }

  return value.replace(/url\(([^)]+)\)/g, (_, rawUrl) => {
    const trimmed = rawUrl.trim();
    const cleaned = trimmed.replace(/^["']|["']$/g, "");
    const resolved = resolveRelativeUrl(cleaned, base);
    if (!resolved) {
      return `url(${rawUrl})`;
    }
    return `url("${resolved}")`;
  });
};

const copyAttributes = (source: Element, target: Element, base: string | null) => {
  Array.from(source.attributes).forEach((attribute) => {
    if (attribute.name === "style") {
      return;
    }

    const lowerName = attribute.name.toLowerCase();
    if (URL_ATTRIBUTES_TO_NORMALIZE.has(lowerName)) {
      if (lowerName === "srcset") {
        target.setAttribute(attribute.name, normalizeSrcset(attribute.value, base));
      } else {
        target.setAttribute(attribute.name, resolveRelativeUrl(attribute.value, base));
      }
      return;
    }

    target.setAttribute(attribute.name, attribute.value);
  });

  const styleValue = source.getAttribute("style");
  if (styleValue) {
    target.setAttribute("style", normalizeStyleUrls(styleValue, base));
  }
};

const DOMTextConstructor = typeof globalThis.Text === "function" ? globalThis.Text : null;
const DOMCommentConstructor = typeof globalThis.Comment === "function" ? globalThis.Comment : null;

const cloneNodeWithResolvedUrls = (node: ChildNode, base: string | null): Node | null => {
  if (DOMTextConstructor ? node instanceof DOMTextConstructor : node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? "");
  }

  if (DOMCommentConstructor ? node instanceof DOMCommentConstructor : node.nodeType === Node.COMMENT_NODE) {
    return document.createComment(node.textContent ?? "");
  }

  if (!(node instanceof Element)) {
    return node.cloneNode(true);
  }

  const tagName = node.tagName.toLowerCase();
  if (tagName === "script") {
    const script = document.createElement("script");
    copyAttributes(node, script, base);
    script.text = node.textContent ?? "";
    return script;
  }

  const clone = node.cloneNode(false) as Element;
  copyAttributes(node, clone, base);
  node.childNodes.forEach((child) => {
    const normalizedChild = cloneNodeWithResolvedUrls(child, base);
    if (normalizedChild) {
      clone.appendChild(normalizedChild);
    }
  });
  return clone;
};

export default function PluginPage() {
  const { id } = useParams<{ id: string }>();
  const pluginRegistry = usePluginRegistry();
  const plugins = pluginRegistry?.plugins ?? [];
  const loading = pluginRegistry?.loading ?? false;
  const navigate = useNavigate();

  const location = useLocation();
  const navigationPlugin = location.state?.plugin as PluginInfo | undefined;
  const plugin = useMemo(() => navigationPlugin ?? plugins.find((p: { id: any; }) => p.id === id), [navigationPlugin, plugins, id]);
  const pluginBaseUrl = useMemo(() => {
    if (!plugin?.frontendUrl) {
      return null;
    }
    try {
      const url = new URL(plugin.frontendUrl);
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/[^/]*$/, "/");
      return url.toString();
    } catch {
      return null;
    }
  }, [plugin?.frontendUrl]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(true);

  useEffect(() => {
    if (!plugin?.frontendUrl) {
      console.log("[PluginPage] Plugin missing frontendUrl, skipping fetch");
      setLoadingHtml(false);
      containerRef.current?.replaceChildren();
      return;
    }

    let cancelled = false;

    const fetchHtml = async () => {
      try {
        setLoadingHtml(true);
        setError(null);
        console.log(`[PluginPage] Fetching plugin HTML from ${plugin.frontendUrl}`);
        const response = await fetch(plugin.frontendUrl!, { credentials: "include" });
        if (!response.ok) {
          throw new Error(response.statusText || "Failed to load plugin");
        }
        const html = await response.text();
        if (cancelled) return;
        console.debug(`[PluginPage] Successfully loaded plugin HTML (${html.length} chars)`);

        if (containerRef.current) {
          containerRef.current.innerHTML = "";

          const dom = new DOMParser().parseFromString(html, "text/html");
          const nodes = [...Array.from(dom.head.childNodes), ...Array.from(dom.body.childNodes)];
          const fragment = document.createDocumentFragment();

          nodes.forEach((node) => {
            const normalizedNode = cloneNodeWithResolvedUrls(node, pluginBaseUrl);
            if (normalizedNode) {
              fragment.appendChild(normalizedNode);
            }
          });

          if (pluginBaseUrl) {
            const backendPrefix = pluginBaseUrl
              .replace(/\/$/, "")
              .replace(/\/plugins\/[^/]+\/?$/, "");
            const bridgeScript = document.createElement("script");
            bridgeScript.textContent = `
              window.STIRLING_PDF_PLUGIN_API_BASE = ${JSON.stringify(backendPrefix)};
              window.STIRLING_PDF_PLUGIN_AUTH_TOKEN =
                localStorage.getItem("stirling_jwt") ||
                sessionStorage.getItem("stirling_jwt") ||
                "";
            `;
            containerRef.current.appendChild(bridgeScript);
          }

          containerRef.current.appendChild(fragment);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("[PluginPage] Failed to load plugin HTML", err);
          setError(err?.message || "Unable to load plugin HTML");
        }
      } finally {
        if (!cancelled) {
          setLoadingHtml(false);
        }
      }
    };

    fetchHtml();

    return () => {
      cancelled = true;
    };
  }, [plugin, pluginBaseUrl]);

  if (loading) {
    return (
      <Box
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text>Loading plugin…</Text>
      </Box>
    );
  }

  if (!plugin) {
    return (
      <Box
        style={{
          padding: "1.5rem",
          height: "100vh",
          background: "var(--bg-app, #05070a)",
          color: "white",
        }}
      >
        <Group justify="space-between" mb="md">
          <Text fw={700}>Plugin not found</Text>
          <Button variant="outline" size="xs" onClick={() => navigate("/")}>
            Back home
          </Button>
        </Group>
        <Text>The requested plugin cannot be loaded right now.</Text>
      </Box>
    );
  }

  return (
    <Box
      component="main"
      style={{
        height: "100vh",
        background: "#05070a",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Group justify="space-between" align="center" style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div>
          <Text fw={600} size="lg">
            {plugin.name}
          </Text>
          <Text size="sm" color="dimmed">
            {plugin.description}
          </Text>
        </div>
        <Button size="xs" variant="outline" onClick={() => navigate("/")}>
          Back to Stirling PDF
        </Button>
      </Group>
      <Box
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {loadingHtml && (
          <Box
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(5, 7, 10, 0.9)",
              zIndex: 1,
            }}
          >
            <Text>Loading plugin UI…</Text>
          </Box>
        )}

        {error && (
          <Box
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "tomato",
              zIndex: 2,
            }}
          >
            <Text>{error}</Text>
          </Box>
        )}

        <Box
          ref={containerRef}
          style={{
            height: "100%",
            width: "100%",
            overflow: "auto",
          }}
        />
      </Box>
    </Box>
  );
}
