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
  const [state, dispatch] = useReducer(
    sessionReducer,
    undefined,
    initialSessionState,
  );

  // Fired here rather than in each consumer's effect so the reset lands once
  // per swap. Resets on null too: a stale revision left by a closed file would
  // re-open the Annotate UI when a viewer remounts with no document behind it.
  const lastDocumentIdRef = useRef(documentId);
  useEffect(() => {
    if (lastDocumentIdRef.current === documentId) return;
    lastDocumentIdRef.current = documentId;
    dispatch({ type: "DOCUMENT_REPLACED" });
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
