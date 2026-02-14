import type { PluginInfo } from "@app/contexts/PluginRegistryContext";

const isTauri = typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;

export async function openPluginWindow(plugin: PluginInfo) {
  if (!plugin.frontendUrl) {
    return;
  }

  if (isTauri) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const windowId = `plugin-${plugin.id}`;
      const pluginWindow = new WebviewWindow(windowId, {
        url: plugin.frontendUrl,
        title: plugin.name,
        width: 1100,
        height: 800,
      });
      pluginWindow.setAlwaysOnTop(true);
      return;
    } catch (error) {
      console.warn("[PluginWindow] failed to open Tauri window", error);
    }
  }

  window.open(plugin.frontendUrl, `_blank`);
}
