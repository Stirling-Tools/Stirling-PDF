import { createContext, useContext, useState, type ReactNode } from "react";

export interface SignatureFieldPick {
  fileId: string;
  fieldNames: ReadonlySet<string>;
  selected: string | null;
  preview: string | null;
  flash: number;
  choose: (fieldName: string) => void;
}

/** PDF points measured from the crop box's top-left corner, before page rotation. */
export interface StampGuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A box drawn over the page where a signature will go. It is never an annotation, so no save can
 * write it into the document.
 */
export interface StampGuide {
  fileId: string;
  /** Waiting for a click on a page to put the box there. */
  placing: boolean;
  pageIndex: number | null;
  rect: StampGuideRect | null;
  /** Each page's crop box size in points, indexed by page. */
  pageSizes: { width: number; height: number }[];
  defaultSize: { width: number; height: number };
  /** The stamp drawn at `rect`'s size, or at `defaultSize` while placing. */
  preview: string | null;
  onChange: (pageIndex: number, rect: StampGuideRect) => void;
}

interface SignatureFieldPickerValue {
  pick: SignatureFieldPick | null;
  setPick: (pick: SignatureFieldPick | null) => void;
  guide: StampGuide | null;
  setGuide: (guide: StampGuide | null) => void;
}

const SignatureFieldPickerContext = createContext<SignatureFieldPickerValue>({
  pick: null,
  setPick: () => {},
  guide: null,
  setGuide: () => {},
});

export function SignatureFieldPickerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pick, setPick] = useState<SignatureFieldPick | null>(null);
  const [guide, setGuide] = useState<StampGuide | null>(null);
  return (
    <SignatureFieldPickerContext.Provider
      value={{ pick, setPick, guide, setGuide }}
    >
      {children}
    </SignatureFieldPickerContext.Provider>
  );
}

export function useSignatureFieldPicker(): SignatureFieldPickerValue {
  return useContext(SignatureFieldPickerContext);
}
