import { describe, it, expect } from "vitest";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";
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

// Real names and tags from the en-GB translations; these tools previously
// polluted results for partial queries like "rotat" and "rotate"
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
  scannerEffect: makeEntry(
    "Scanner Effect",
    "scan,simulate,create,fake scan,look scanned,scanner effect,make look scanned,photocopy effect,simulate scanner,realistic scan",
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
    // Regression: "rotat" used to also pull in Redact, Annotate, Compare and
    // Adjust Colours/Contrast, and "rotate" additionally Scanner Effect,
    // Change Metadata, Add Password and Air-gapped Setup
    expect(idsFor("rota")).toEqual(["rotate"]);
    expect(idsFor("rotat")).toEqual(["rotate"]);
    expect(idsFor("rotate")).toEqual(["rotate"]);
  });
});
