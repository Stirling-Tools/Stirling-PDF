import { createContext } from "react";

/** The languages the open document is read in, which every language picker lists first. */
export const LanguagesInUse = createContext<readonly string[]>([]);
