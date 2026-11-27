import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PDFDocument, PDFString } from "@cantoo/pdf-lib";
import { createStirlingFile, type FileId } from "@editor/types/fileContext";
import {
  SignatureFieldPickerProvider,
  useSignatureFieldPicker,
} from "@editor/contexts/SignatureFieldPickerContext";
import SignatureFieldOverlay from "@editor/components/viewer/SignatureFieldOverlay";

// With no pdfSource the overlay resolves zero fields and renders null — this
// is the state it's mounted in until the host viewer has a document loaded.
const meta = {
  title: "Viewer/SignatureFieldOverlay",
  component: SignatureFieldOverlay,
} satisfies Meta<typeof SignatureFieldOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pageIndex: 0,
    pdfSource: null,
    documentId: "doc-1",
    pageWidth: 612,
    pageHeight: 792,
  },
};

const STORY_FILE_ID = "story-contract" as FileId;

async function twoFieldPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  for (const [name, x] of [
    ["Company signature", 72],
    ["Supplier signature", 340],
  ] as const) {
    const widget = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Widget",
        FT: "Sig",
        F: 4,
        T: PDFString.of(name),
        Rect: [x, 160, x + 200, 220],
        P: page.ref,
      }),
    );
    page.node.addAnnot(widget);
    form.acroForm.addField(widget);
  }
  const bytes = await doc.save();
  return createStirlingFile(
    new File([bytes.slice().buffer], "contract.pdf", {
      type: "application/pdf",
    }),
    STORY_FILE_ID,
  );
}

function PickableFields({ children }: { children: ReactNode }) {
  const { setPick } = useSignatureFieldPicker();
  const [selected, setSelected] = useState("Company signature");
  useEffect(() => {
    setPick({
      fileId: STORY_FILE_ID,
      fieldNames: new Set(["Company signature", "Supplier signature"]),
      selected,
      preview: null,
      flash: 0,
      choose: setSelected,
    });
  }, [selected, setPick]);
  return <>{children}</>;
}

export const PickableFieldsOnPage: Story = {
  args: {
    pageIndex: 0,
    pdfSource: null,
    documentId: "doc-1",
    pageWidth: 612,
    pageHeight: 792,
  },
  loaders: [async () => ({ pdf: await twoFieldPdf() })],
  render: (args, { loaded }) => (
    <SignatureFieldPickerProvider>
      <PickableFields>
        <div
          style={{
            position: "relative",
            width: args.pageWidth,
            height: args.pageHeight,
            background: "white",
            border: "1px solid var(--c-border)",
          }}
        >
          <SignatureFieldOverlay {...args} pdfSource={loaded.pdf as File} />
        </div>
      </PickableFields>
    </SignatureFieldPickerProvider>
  ),
};
