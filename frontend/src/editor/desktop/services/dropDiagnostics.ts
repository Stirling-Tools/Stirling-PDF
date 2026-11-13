import { invoke } from "@tauri-apps/api/core";

// Writes each drag from outside the app to the desktop log, so a drop that
// arrives late or never can be traced from a user's log. The usual suspect is a
// source (e.g. a DMS) offering files only as data, which WebView2 must copy to
// disk before the page sees the drop. File names stay out of the log.

const QUIET_MS = 1500;

export function logDropDiagnostic(message: string): void {
  void invoke("log_drop_diagnostic", { message }).catch(() => {});
}

export function folderOf(path: string | null | undefined): string {
  if (!path) return "no path";
  const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return cut > 0 ? path.slice(0, cut) : path;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "(none)";
}

function describe(transfer: DataTransfer | null): string {
  if (!transfer) return "no data";
  const types = Array.from(transfer.types ?? []).join(", ");
  const items = Array.from(transfer.items ?? [])
    .map((item) => `${item.kind} ${item.type || "?"}`)
    .join(", ");
  const files = Array.from(transfer.files ?? [])
    .map((file) => `${extension(file.name)} ${file.size} B`)
    .join(", ");
  return `types [${types}] items [${items}] files [${files}]`;
}

/** Installs the app-wide drag listeners. Cleanup removes them. */
export function captureDropDiagnostics(): () => void {
  let enteredAt: number | null = null;
  let lastOverAt = 0;
  // Drags that start inside the page (reordering pages or files) are not traced.
  let fromPage = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const since = (from: number) => `${Math.round(performance.now() - from)} ms`;

  const armQuiet = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      if (enteredAt === null) return;
      logDropDiagnostic(
        `no dragover for ${QUIET_MS} ms and no drop, ${since(enteredAt)} after the drag entered (it left the window, or the drop is being held back)`,
      );
      enteredAt = null;
    }, QUIET_MS);
  };

  const enter = (event: DragEvent) => {
    if (fromPage || enteredAt !== null) return;
    enteredAt = performance.now();
    lastOverAt = enteredAt;
    logDropDiagnostic(`drag entered: ${describe(event.dataTransfer)}`);
    // Armed here too: a drag that leaves before its first dragover would
    // otherwise stay "entered" and hide the next drag's entry.
    armQuiet();
  };
  const over = (event: DragEvent) => {
    if (fromPage) return;
    enter(event);
    lastOverAt = performance.now();
    armQuiet();
  };
  const drop = (event: DragEvent) => {
    if (fromPage) return;
    clearTimeout(quiet);
    logDropDiagnostic(
      `drop ${since(lastOverAt)} after the last dragover: ${describe(event.dataTransfer)}`,
    );
    enteredAt = null;
  };
  const start = () => {
    fromPage = true;
  };
  const end = () => {
    fromPage = false;
  };

  const listeners: [string, (event: DragEvent) => void][] = [
    ["dragstart", start],
    ["dragend", end],
    ["dragenter", enter],
    ["dragover", over],
    ["drop", drop],
  ];
  for (const [type, listener] of listeners) {
    document.addEventListener(type, listener as EventListener, true);
  }
  return () => {
    clearTimeout(quiet);
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener as EventListener, true);
    }
  };
}
