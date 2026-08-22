/**
 * Rebuild FormData so every File/Blob entry is a fresh in-memory File.
 *
 * Tauri / WebKit throws `InvalidStateError: Unable to read form data file`
 * when serialising FormData that still references picker / IndexedDB-backed
 * File handles (common after multi-step wizards). Reading bytes via
 * `arrayBuffer()` and wrapping in `new File([...])` makes Request / fetch
 * multipart encoding reliable.
 */
export async function materializeFormDataFiles(
  formData: FormData,
): Promise<FormData> {
  const out = new FormData();
  for (const [key, value] of formData.entries()) {
    if (value instanceof Blob) {
      const buffer = await value.arrayBuffer();
      const name = value instanceof File && value.name ? value.name : key;
      const type = value.type || "application/octet-stream";
      const lastModified =
        value instanceof File && Number.isFinite(value.lastModified)
          ? value.lastModified
          : Date.now();
      // Pass a Uint8Array view — some runtimes mishandle raw ArrayBuffer blob parts.
      out.append(
        key,
        new File([new Uint8Array(buffer)], name, { type, lastModified }),
      );
    } else {
      out.append(key, value);
    }
  }
  return out;
}
