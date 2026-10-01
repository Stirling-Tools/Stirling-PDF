import { isTauri } from "@tauri-apps/api/core";
import type { PickedDirectory } from "@app/services/directoryPicker";

interface WebviewBridge {
  postMessageWithAdditionalObjects: (message: string, objects: File[]) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
}

function getBridge(): WebviewBridge | undefined {
  return (window as Window & { chrome?: { webview?: WebviewBridge } }).chrome
    ?.webview;
}

export const canDropDirectory =
  isTauri() &&
  typeof getBridge()?.postMessageWithAdditionalObjects === "function";

/** Captures one dropped directory without reading or persisting its contents; null rejects the drop. */
export async function directoryFromDrop(
  dataTransfer: DataTransfer,
): Promise<PickedDirectory | null> {
  const bridge = getBridge();
  const item = dataTransfer.items[0];
  const file = dataTransfer.files[0];
  if (
    !canDropDirectory ||
    !bridge ||
    !file ||
    dataTransfer.files.length !== 1 ||
    !item?.webkitGetAsEntry()?.isDirectory
  )
    return null;

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => finish(null), 5000);
    function finish(directory: PickedDirectory | null) {
      window.clearTimeout(timeout);
      bridge!.removeEventListener("message", onMessage);
      resolve(directory);
    }
    function onMessage(event: MessageEvent) {
      const response = event.data;
      if (
        response?.type !== "stirling-folder-drop-result" ||
        response.requestId !== requestId
      )
        return;
      finish(
        typeof response.path === "string" && response.path.length > 0
          ? { path: response.path, name: file.name }
          : null,
      );
    }
    bridge.addEventListener("message", onMessage);
    try {
      bridge.postMessageWithAdditionalObjects(
        JSON.stringify({ type: "stirling-folder-drop", requestId }),
        [file],
      );
    } catch (error) {
      window.clearTimeout(timeout);
      bridge.removeEventListener("message", onMessage);
      reject(error);
    }
  });
}
