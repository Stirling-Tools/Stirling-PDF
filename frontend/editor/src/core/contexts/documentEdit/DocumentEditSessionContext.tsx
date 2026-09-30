import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  initialSessionState,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from "@app/contexts/documentEdit/sessionReducer";

// Split deliberately: a component that only dispatches must not re-render when
// the state changes, and a component that only reads must not re-render when a
// sibling dispatches.
const SessionStateContext = createContext<SessionState | null>(null);
const SessionDispatchContext = createContext<Dispatch<SessionAction> | null>(
  null,
);

export function DocumentEditSessionProvider({
  documentId,
  children,
}: {
  documentId: string | null;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => ({
    ...initialSessionState(),
    documentId,
  }));

  // One transition per document swap, rather than each component effect clearing
  // its own flags and hoping they land in a consistent order.
  const lastDocumentIdRef = useRef(documentId);
  useEffect(() => {
    if (lastDocumentIdRef.current === documentId) return;
    lastDocumentIdRef.current = documentId;
    if (documentId !== null) {
      dispatch({ type: "DOCUMENT_REPLACED", documentId });
    }
  }, [documentId]);

  return (
    <SessionStateContext.Provider value={state}>
      <SessionDispatchContext.Provider value={dispatch}>
        {children}
      </SessionDispatchContext.Provider>
    </SessionStateContext.Provider>
  );
}

export function useDocumentEditSession(): SessionState {
  const state = useContext(SessionStateContext);
  if (!state) {
    throw new Error(
      "useDocumentEditSession must be used inside a DocumentEditSessionProvider",
    );
  }
  return state;
}

export function useDocumentEditDispatch(): Dispatch<SessionAction> {
  const dispatch = useContext(SessionDispatchContext);
  if (!dispatch) {
    throw new Error(
      "useDocumentEditDispatch must be used inside a DocumentEditSessionProvider",
    );
  }
  return dispatch;
}
