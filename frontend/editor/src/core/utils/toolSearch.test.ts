import { describe, it, expect } from "vitest";
import {
  filterToolRegistryByQuery,
  TOOL_SEARCH_FIELDS,
} from "@app/utils/toolSearch";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import type { ToolId } from "@app/types/toolId";
import {
  ToolCategoryId,
  SubcategoryId,
  ToolRegistry,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";

function makeEntry(name: string, tags: string): ToolRegistryEntry {
  return {
    icon: null,
    name,
    component: null,
    description: "",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    synonyms: tags.split(","),
  };
}

// Real names and tags from the en-GB translations, chosen because they share
// letters with "rotat"/"rotate" and stress the partial-query filtering.
const registry: Partial<ToolRegistry> = {
  rotate: makeEntry(
    "Rotate",
    "turn,flip,orient,rotate,orientation,landscape,portrait,90 degrees,180 degrees,clockwise,anticlockwise,counter-clockwise,fix orientation",
  ),
  addPassword: makeEntry(
    "Add Password",
    "encrypt,password,lock,secure,protect,security,encryption,safeguard,confidential,private,restrict access",
  ),
  changeMetadata: makeEntry(
    "Change Metadata",
    "edit,modify,update,metadata,properties,document properties,author,title,subject,keywords,creator,producer,info,document info,file properties",
  ),
  adjustContrast: makeEntry(
    "Adjust Colours/Contrast",
    "contrast,brightness,saturation,adjust colors,color correction,enhance,lighten,darken,improve quality,color balance,hue,vibrance",
  ),
  annotate: makeEntry(
    "Annotate",
    "annotate,highlight,draw,markup,comment,notes,review,redline,feedback,markup tools,sticky notes,shapes,arrows,text box,freehand",
  ),
  redact: makeEntry(
    "Redact",
    "censor,blackout,hide,redact,redaction,black out,block out,remove sensitive,hide text,privacy,confidential,GDPR,PII,sensitive data,permanently remove,cover up,legal redaction",
  ),
  compare: makeEntry(
    "Compare",
    "difference,compare,diff,compare PDFs,compare documents,find differences,show differences,changes,what changed,track changes,revisions,version compare,side by side,contrast,delta",
  ),
};

function idsFor(query: string): string[] {
  return filterToolRegistryByQuery(registry, query).map(({ item: [id] }) => id);
}

describe("filterToolRegistryByQuery", () => {
  it("returns everything for an empty query", () => {
    expect(idsFor("")).toHaveLength(Object.keys(registry).length);
  });

  it("matches tools by tag substring", () => {
    expect(idsFor("protect")).toEqual(["addPassword"]);
    expect(idsFor("orientation")).toEqual(["rotate"]);
  });

  it("only returns Rotate for every prefix of 'rotate'", () => {
    // Prefixes of "rotate" must not leak tools that merely share letters
    // (Redact, Annotate, Compare, Adjust Colours/Contrast, etc.).
    expect(idsFor("rota")).toEqual(["rotate"]);
    expect(idsFor("rotat")).toEqual(["rotate"]);
    expect(idsFor("rotate")).toEqual(["rotate"]);
  });
});

// A slice of the en-GB tool catalogue: id, name, description, tags.
const CATALOGUE: [string, string, string, string][] = [
  [
    "compress",
    "Compress",
    "Compress PDFs to reduce their file size.",
    "shrink,reduce,optimise,compress,smaller,downsize,file size,reduce size,minimise,make smaller,decrease size,optimise size",
  ],
  [
    "convert",
    "Convert",
    "Convert files between different formats",
    "transform,change,convert,PDF to Word,PDF to Excel,PDF to image,PDF to PDF/A,PDF/A,PDFA,PDF/A-1b,PDF/A-2b,PDF/A-3b,PDF/X,archive,archival,Word to PDF,Excel to PDF,PowerPoint to PDF,HTML to PDF,export,import,file conversion,format change,save as",
  ],
  [
    "merge",
    "Merge",
    "Easily merge multiple PDFs into one.",
    "combine,join,unite,merge,merge PDFs,combine PDFs,join PDFs,concatenate,append,stitch,combine files,join files,merge documents",
  ],
  [
    "split",
    "Split",
    "Split PDFs into multiple documents",
    "divide,separate,break,split,extract pages,separate pages,divide document,break apart,separate files,unbind,split by page,divide by chapter",
  ],
  [
    "splitByChapters",
    "Split PDF by Chapters",
    "",
    "split,chapters,structure,split by chapters,split by bookmarks,bookmarks,outline,table of contents,TOC split,chapter split,divide by sections",
  ],
  [
    "rotate",
    "Rotate",
    "Easily rotate your PDFs.",
    "turn,flip,orient,rotate,orientation,landscape,portrait,90 degrees,180 degrees,clockwise,anticlockwise,counter-clockwise,fix orientation",
  ],
  [
    "addPassword",
    "Add Password",
    "Add password protection and restrictions to PDF files",
    "encrypt,password,lock,secure,protect,security,encryption,safeguard,confidential,private,restrict access",
  ],
  [
    "removePassword",
    "Remove Password",
    "Remove password protection from your PDF document.",
    "unlock,remove password,unlock PDF,decrypt,remove encryption,unprotect,open protected PDF,password removal,unlock protected,disable password,remove security,remove owner password",
  ],
  [
    "removePages",
    "Remove Pages",
    "Remove specific pages from a PDF document",
    "delete,extract,exclude,remove pages,delete pages,remove page,delete page,exclude pages,take out pages,discard pages,drop pages",
  ],
  [
    "pdfOrganiser",
    "Organise",
    "",
    "organise,rearrange,reorder,organise,arrange pages,sort,move pages,delete pages,remove pages,page management,page organiser,page organiser,resequence",
  ],
  [
    "extractPages",
    "Extract Pages",
    "Extract specific pages from a PDF document",
    "pull,select,copy,extract,extract pages,get pages,pull out,save pages,export pages,copy pages,select pages,specific pages",
  ],
  [
    "repair",
    "Repair",
    "Tries to repair a corrupt/broken PDF",
    "fix,restore,repair,fix PDF,fix broken,fix corrupt,repair PDF,repair corrupt,broken PDF,corrupt PDF,damaged PDF,recover,fix errors,PDF won't open,can't open PDF,PDF errors,troubleshoot,restore PDF,rebuild,corrupted",
  ],
  [
    "watermark",
    "Add Watermark",
    "Add a custom watermark to your PDF document.",
    "stamp,mark,overlay,watermark,branding,logo,confidential,draft,copyright,trademark,text overlay,image overlay,background text",
  ],
  [
    "addImage",
    "Add image",
    "Adds a image onto a set location on the PDF",
    "insert,embed,place,add image,insert image,place image,embed image,add photo,add picture,add logo,graphics,insert picture,place photo,PNG,JPG,JPEG",
  ],
  [
    "extractImages",
    "Extract Images",
    "Extracts all images from a PDF and saves them to zip",
    "pull,save,export,extract images,get images,save images,export images,extract photos,extract pictures,pull images,download images,rip images,extract graphics,save photos",
  ],
  [
    "removeImage",
    "Remove image",
    "Remove image from PDF to reduce file size",
    "remove,delete,clean,remove image,delete image,strip images,remove pictures,delete photos,clean images,reduce size,remove graphics",
  ],
  [
    "unlockPDFForms",
    "Unlock PDF Forms",
    "Remove read-only property of form fields in a PDF document.",
    "unlock,enable,edit,unlock forms,enable forms,editable forms,remove read only,make editable,unlock fields,enable editing,form fields,fillable,unprotect forms",
  ],
  [
    "ocr",
    "OCR / Cleanup scans",
    "Cleanup scans and detects text from images within a PDF and re-adds it as text.",
    "extract,scan,OCR,optical character recognition,text recognition,scan to text,image to text,scanned document,searchable PDF,make searchable,extract text,recognise text,read scanned",
  ],
  [
    "addPageNumbers",
    "Add Page Numbers",
    "Add Page numbers throughout a document in a set location",
    "number,pagination,count,add page numbers,page numbering,page numbers,footer,header,number pages,sequential,pagination tool",
  ],
  [
    "sign",
    "Sign",
    "Adds signature to PDF by drawing, text or image",
    "signature,autograph,e-sign,electronic signature,digital signature,sign document,approval,signoff,authorise,endorse,ink signature,handwriting",
  ],
  [
    "redact",
    "Redact",
    "Redacts (blacks out) a PDF based on selected text, drawn shapes and/or selected page(s)",
    "censor,blackout,hide,redact,redaction,black out,block out,remove sensitive,hide text,privacy,confidential,GDPR,PII,sensitive data,permanently remove,cover up,legal redaction",
  ],
  [
    "changeMetadata",
    "Change Metadata",
    "Change/Remove/Add metadata from a PDF document",
    "edit,modify,update,metadata,properties,document properties,author,title,subject,keywords,creator,producer,info,document info,file properties",
  ],
];

const ENTRIES = CATALOGUE.map(
  ([id, name, description, tags]) =>
    [id as ToolId, { ...makeEntry(name, tags), description }] as [
      ToolId,
      ToolRegistryEntry,
    ],
);

const rank = (query: string) =>
  rankByFuzzy(ENTRIES, query, TOOL_SEARCH_FIELDS).map(({ item: [id] }) => id);

describe("tool search ranking", () => {
  it.each([
    ["compress", "compress"],
    ["compress pdf", "compress"],
    ["shrink", "compress"],
    ["make smaller", "compress"],
    ["reduce file size", "compress"],
    ["pdf to word", "convert"],
    ["pdf to image", "convert"],
    ["word", "convert"],
    ["combine pdfs", "merge"],
    ["add password", "addPassword"],
    ["remove pages", "removePages"],
    ["split chapters", "splitByChapters"],
    ["rotate landscape", "rotate"],
    ["fix corrupt pdf", "repair"],
    ["extract text", "ocr"],
    ["pdf/a", "convert"],
    ["pdfa", "convert"],
    ["pdf a", "convert"],
    ["PDF/A-2b", "convert"],
  ])("%j ranks %s first", (query, expected) => {
    expect(rank(query)[0]).toBe(expected);
  });

  it("finds both password tools despite a typo", () => {
    expect(rank("pasword").slice(0, 2).sort()).toEqual([
      "addPassword",
      "removePassword",
    ]);
  });

  it("requires every meaningful word to match", () => {
    // "rotate" matches; "chapters" matches nothing on the Rotate tool.
    expect(rank("rotate chapters")).not.toContain("rotate");
  });

  it("matches filler-only queries as a phrase, not word by word", () => {
    // Word by word, "pdf" + "a" would hit nearly every tool.
    expect(rank("pdfa")).toEqual(["convert"]);
    expect(rank("pdf/a").length).toBeLessThan(5);
  });

  it("does not match unrelated tools on shared letters", () => {
    expect(rank("rotate")).toEqual(["rotate"]);
  });
});
