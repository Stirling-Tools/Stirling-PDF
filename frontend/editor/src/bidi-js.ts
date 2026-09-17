declare module "bidi-js" {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  interface BidiRuntime {
    getEmbeddingLevels(
      text: string,
      baseDirection?: "ltr" | "rtl",
    ): EmbeddingLevels;
    getReorderedIndices(text: string, embedding: EmbeddingLevels): number[];
    getMirroredCharactersMap(
      text: string,
      levels: Uint8Array,
    ): Map<number, string>;
    getBidiCharTypeName(character: string): string;
  }

  const bidiFactory: () => BidiRuntime;
  export default bidiFactory;
}
