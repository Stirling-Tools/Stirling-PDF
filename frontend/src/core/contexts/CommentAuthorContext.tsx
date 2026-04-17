import { createContext, useContext, type ReactNode } from "react";

export interface CommentAuthorValue {
  displayName: string;
}

const defaultValue: CommentAuthorValue = { displayName: "Guest" };

const CommentAuthorContext = createContext<CommentAuthorValue>(defaultValue);

export function CommentAuthorProvider({
  children,
  displayName = "Guest",
}: {
  children: ReactNode;
  displayName?: string;
}) {
  return (
    <CommentAuthorContext.Provider value={{ displayName }}>
      {children}
    </CommentAuthorContext.Provider>
  );
}

export function useCommentAuthor(): CommentAuthorValue {
  return useContext(CommentAuthorContext);
}
