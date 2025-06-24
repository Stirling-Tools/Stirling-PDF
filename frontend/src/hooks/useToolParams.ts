import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

// Tool parameter definitions (shortened URLs)
const TOOL_PARAMS = {
  split: [
    "mode", "p", "hd", "vd", "m",
    "type", "val", "level", "meta", "dupes"
  ],
  compress: [
    "level", "gray", "rmeta", "size", "agg"
  ],
  merge: [
    "order", "rdupes"
  ]
};

// Extract params for a specific tool from URL
function getToolParams(toolKey: string, searchParams: URLSearchParams) {
  switch (toolKey) {
    case "split":
      return {
        mode: searchParams.get("mode") || "byPages",
        pages: searchParams.get("p") || "",
        hDiv: searchParams.get("hd") || "",
        vDiv: searchParams.get("vd") || "",
        merge: searchParams.get("m") === "true",
        splitType: searchParams.get("type") || "size",
        splitValue: searchParams.get("val") || "",
        bookmarkLevel: searchParams.get("level") || "0",
        includeMetadata: searchParams.get("meta") === "true",
        allowDuplicates: searchParams.get("dupes") === "true",
      };
    case "compress":
      return {
        compressionLevel: parseInt(searchParams.get("level") || "5"),
        grayscale: searchParams.get("gray") === "true",
        removeMetadata: searchParams.get("rmeta") === "true",
        expectedSize: searchParams.get("size") || "",
        aggressive: searchParams.get("agg") === "true",
      };
    case "merge":
      return {
        order: searchParams.get("order") || "default",
        removeDuplicates: searchParams.get("rdupes") === "true",
      };
    default:
      return {};
  }
}

// Update tool-specific params in URL
function updateToolParams(toolKey: string, searchParams: URLSearchParams, setSearchParams: any, newParams: any) {
  const params = new URLSearchParams(searchParams);

  // Clear tool-specific params
  if (toolKey === "split") {
    ["mode", "p", "hd", "vd", "m", "type", "val", "level", "meta", "dupes"].forEach((k) => params.delete(k));
    // Set new split params
    const merged = { ...getToolParams("split", searchParams), ...newParams };
    params.set("mode", merged.mode);
    if (merged.mode === "byPages") params.set("p", merged.pages);
    else if (merged.mode === "bySections") {
      params.set("hd", merged.hDiv);
      params.set("vd", merged.vDiv);
      params.set("m", String(merged.merge));
    } else if (merged.mode === "bySizeOrCount") {
      params.set("type", merged.splitType);
      params.set("val", merged.splitValue);
    } else if (merged.mode === "byChapters") {
      params.set("level", merged.bookmarkLevel);
      params.set("meta", String(merged.includeMetadata));
      params.set("dupes", String(merged.allowDuplicates));
    }
  } else if (toolKey === "compress") {
    ["level", "gray", "rmeta", "size", "agg"].forEach((k) => params.delete(k));
    const merged = { ...getToolParams("compress", searchParams), ...newParams };
    params.set("level", String(merged.compressionLevel));
    params.set("gray", String(merged.grayscale));
    params.set("rmeta", String(merged.removeMetadata));
    if (merged.expectedSize) params.set("size", merged.expectedSize);
    params.set("agg", String(merged.aggressive));
  } else if (toolKey === "merge") {
    ["order", "rdupes"].forEach((k) => params.delete(k));
    const merged = { ...getToolParams("merge", searchParams), ...newParams };
    params.set("order", merged.order);
    params.set("rdupes", String(merged.removeDuplicates));
  }

  setSearchParams(params, { replace: true });
}

export function useToolParams(selectedToolKey: string, currentView: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const toolParams = getToolParams(selectedToolKey, searchParams);
  
  const updateParams = (newParams: any) =>
    updateToolParams(selectedToolKey, searchParams, setSearchParams, newParams);

  // Update URL when core state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);

    // Remove all tool-specific params except for the current tool
    Object.entries(TOOL_PARAMS).forEach(([tool, keys]) => {
      if (tool !== selectedToolKey) {
        keys.forEach((k) => params.delete(k));
      }
    });

    // Collect all params except 'v'
    const entries = Array.from(params.entries()).filter(([key]) => key !== "v");

    // Rebuild params with 'v' first
    const newParams = new URLSearchParams();
    newParams.set("v", currentView);
    newParams.set("t", selectedToolKey);
    entries.forEach(([key, value]) => {
      if (key !== "t") newParams.set(key, value);
    });

    setSearchParams(newParams, { replace: true });
  }, [selectedToolKey, currentView, setSearchParams, searchParams]);

  return {
    toolParams,
    updateParams,
  };
}