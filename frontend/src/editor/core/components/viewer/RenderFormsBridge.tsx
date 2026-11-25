import { useEffect } from "react";
import { refreshPages } from "@embedpdf/core";
import { useRegistry } from "@embedpdf/core/react";
import { useRenderPlugin } from "@embedpdf/plugin-render/react";
import type { RenderPlugin, RenderPluginConfig } from "@embedpdf/plugin-render";

/** Returns true when the plugin's form-baking setting actually changed. */
export function setRenderWithForms(
  plugin: RenderPlugin,
  withForms: boolean,
): boolean {
  // embedpdf reads this private config on every render and has no setter.
  const config = (plugin as unknown as { config: RenderPluginConfig }).config;
  if (config.withForms === withForms) return false;
  config.withForms = withForms;
  return true;
}

/**
 * Keeps form appearances out of the page bitmap while the form-fill overlay
 * draws them; null (access pending) leaves the current setting alone.
 */
export function RenderFormsBridge({
  withForms,
}: {
  withForms: boolean | null;
}) {
  const { plugin } = useRenderPlugin();
  const { registry } = useRegistry();

  useEffect(() => {
    if (!plugin || !registry || withForms === null) return;
    if (!setRenderWithForms(plugin, withForms)) return;
    const store = registry.getStore();
    for (const [documentId, doc] of Object.entries(
      store.getState().core.documents,
    )) {
      const pageCount = doc.document?.pages.length ?? 0;
      if (pageCount === 0) continue;
      store.dispatch(
        refreshPages(
          documentId,
          Array.from({ length: pageCount }, (_, i) => i),
        ),
      );
    }
  }, [plugin, registry, withForms]);

  return null;
}
