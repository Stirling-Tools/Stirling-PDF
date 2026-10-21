import { describe, expect, it } from "vitest";

import {
  chunkIndexForChar,
  chunkTextForSpeech,
  wordIndexAtChar,
} from "@app/services/readAloud/chunkText";

describe("chunkTextForSpeech", () => {
  it("returns no chunks for blank text", () => {
    expect(chunkTextForSpeech("   ")).toEqual([]);
  });

  it("keeps a short sentence as one chunk", () => {
    const text = "This is a short sentence.";
    expect(chunkTextForSpeech(text)).toEqual([
      { text, startChar: 0, endChar: text.length },
    ]);
  });

  it("splits sentences and keeps offsets pointing at the original text", () => {
    const text = "First sentence. Second sentence! Third?";
    const chunks = chunkTextForSpeech(text);
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      expect(text.slice(chunk.startChar, chunk.endChar)).toBe(chunk.text);
    }
  });

  it("bounded chunks stay under the limit", () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} has a few words in it.`,
    ).join(" ");
    const chunks = chunkTextForSpeech(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 60)).toBe(true);
  });

  it("does not split inside a word when a space is available", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const chunks = chunkTextForSpeech(text, 20);
    expect(
      chunks.every((chunk) => chunk.text.split(/\s+/).every(Boolean)),
    ).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join(" ")).toBe(text);
  });

  it("hard-splits unspaced scripts rather than dropping text", () => {
    const text =
      "本租赁合同由出租人与承租人就位于城市的房屋订立承租人应按照约定支付租金";
    const chunks = chunkTextForSpeech(text, 20);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.text.length <= 20)).toBe(true);
  });
});

describe("chunkIndexForChar", () => {
  const chunks = chunkTextForSpeech("One. Two. Three.");

  it("finds the chunk containing a character", () => {
    expect(chunkIndexForChar(chunks, 0)).toBe(0);
    expect(chunkIndexForChar(chunks, chunks[1].startChar)).toBe(1);
  });

  it("clamps past the end to the last chunk", () => {
    expect(chunkIndexForChar(chunks, 999)).toBe(chunks.length - 1);
  });
});

describe("wordIndexAtChar", () => {
  const words = ["one", "two", "three"];

  it("maps a character to its word", () => {
    expect(wordIndexAtChar(words, 0)).toBe(0);
    expect(wordIndexAtChar(words, 4)).toBe(1);
    expect(wordIndexAtChar(words, 8)).toBe(2);
  });

  it("returns -1 on a separating space", () => {
    expect(wordIndexAtChar(words, 3)).toBe(-1);
  });
});
