import { createContext, useContext, useState, type ReactNode } from "react";

export interface SignatureFieldPick {
  fieldNames: ReadonlySet<string>;
  selected: string | null;
  preview: string | null;
  choose: (fieldName: string) => void;
}

interface SignatureFieldPickerValue {
  pick: SignatureFieldPick | null;
  setPick: (pick: SignatureFieldPick | null) => void;
}

const SignatureFieldPickerContext = createContext<SignatureFieldPickerValue>({
  pick: null,
  setPick: () => {},
});

export function SignatureFieldPickerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pick, setPick] = useState<SignatureFieldPick | null>(null);
  return (
    <SignatureFieldPickerContext.Provider value={{ pick, setPick }}>
      {children}
    </SignatureFieldPickerContext.Provider>
  );
}

export function useSignatureFieldPicker(): SignatureFieldPickerValue {
  return useContext(SignatureFieldPickerContext);
}
