import JSZip from 'jszip';

export interface ExtractedDocxText {
  text: string;
  characterCount: number;
}

export async function extractTextFromDocx(file: File): Promise<ExtractedDocxText> {
  const zip = await JSZip.loadAsync(file);
  const documentXml =
      (await zip.file('word/document.xml')?.async('string')) ??
      (await zip.file('word/document2.xml')?.async('string'));

  if (!documentXml) {
    throw new Error('Docx document.xml missing');
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, 'application/xml');
  const paragraphNodes = [
      ...Array.from(xml.getElementsByTagNameNS('*', 'p')),
      ...Array.from(xml.getElementsByTagName('w:p')),
  ];
  const text = paragraphNodes
          .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n')
          .trim();

  return {
    text,
    characterCount: text.length,
  };
}
