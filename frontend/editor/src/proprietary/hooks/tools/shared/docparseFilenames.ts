/** Filename helpers shared by the DocParse tool processors. */

/** "invoice.pdf" -> "invoice"; keeps names without an extension intact. */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Derived output name, e.g. deriveName("a.pdf", ".fields.json") -> "a.fields.json". */
export function deriveName(inputName: string, suffix: string): string {
  return `${stripExtension(inputName)}${suffix}`;
}
