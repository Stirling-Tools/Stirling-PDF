import { invoke } from "@tauri-apps/api/core";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";

interface FileDropBridge {
  postMessageWithAdditionalObjects(message: string, objects: File[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
}

function resolveWindowsPaths(
  bridge: FileDropBridge,
  files: File[],
): Promise<(string | null)[]> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (paths: (string | null)[]) => {
      window.clearTimeout(timeout);
      bridge.removeEventListener("message", onMessage);
      resolve(paths);
    };
    const onMessage = (event: MessageEvent) => {
      const response = event.data;
      if (
        response?.type !== "stirling-file-drop-result" ||
        response.requestId !== requestId
      )
        return;
      finish(Array.isArray(response.paths) ? response.paths : []);
    };
    const timeout = window.setTimeout(() => finish([]), 5000);
    bridge.addEventListener("message", onMessage);
    try {
      bridge.postMessageWithAdditionalObjects(
        JSON.stringify({ type: "stirling-file-drop", requestId }),
        files,
      );
    } catch {
      finish([]);
    }
  });
}

function fileDropBridge(): FileDropBridge | undefined {
  return (window as Window & { chrome?: { webview?: FileDropBridge } }).chrome
    ?.webview;
}

function resolveDroppedPaths(files: File[]): Promise<(string | null)[]> {
  const bridge = fileDropBridge();
  return (
    bridge?.postMessageWithAdditionalObjects
      ? resolveWindowsPaths(bridge, files)
      : invoke<(string | null)[]>("resolve_dropped_file_paths", {
          files: files.map(({ name, size, lastModified }) => ({
            name,
            size,
            lastModified,
          })),
        })
  ).catch(() => []);
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Captures drop provenance before UI handlers run. Cleanup removes the app-wide listeners. */
export function captureDroppedFilePaths(): () => void {
  const onDrop = (event: DragEvent) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    // resolveDroppedPaths falls back to the mid-drag snapshot below, so capturing
    // here still works even though addFiles may wait on ZIP extraction or another import.
    const paths = resolveDroppedPaths(files);
    files.forEach((file, index) => {
      pendingFilePathMappings.set(
        file,
        paths.then((paths) => paths[index] || undefined),
      );
    });
  };

  // macOS: the drag pasteboard is empty by the time the drop's async command runs,
  // so snapshot it while the drag is still live. WebView2 resolves the File
  // directly and needs none of this. One snapshot is in flight at a time.
  const usesPasteboard = !fileDropBridge()?.postMessageWithAdditionalObjects;
  let snapshotPending = false;
  const onDragOver = (event: DragEvent) => {
    if (!usesPasteboard || snapshotPending || !isFileDrag(event)) return;
    snapshotPending = true;
    void invoke("snapshot_dragged_file_paths")
      .catch(() => {})
      .finally(() => {
        snapshotPending = false;
      });
  };

  document.addEventListener("drop", onDrop, true);
  document.addEventListener("dragover", onDragOver, true);
  return () => {
    document.removeEventListener("drop", onDrop, true);
    document.removeEventListener("dragover", onDragOver, true);
  };
}

/** Returns the original path for this File only; generated files have no disk source. */
export async function sourcePathForFile(
  file: File,
): Promise<string | undefined> {
  if (pendingFilePathMappings.has(file))
    return pendingFilePathMappings.get(file);
  const bridge = fileDropBridge();
  if (!bridge?.postMessageWithAdditionalObjects) return undefined;
  // Chromium's FileSystemHandle can supply a new File instance after drop capture.
  // WebView2 resolves that File's native backing; synthetic Files return no path.
  const path = resolveWindowsPaths(bridge, [file])
    .then((paths) => paths[0] || undefined)
    .catch(() => undefined);
  pendingFilePathMappings.set(file, path);
  return path;
}
