import { createContext, useContext } from "react";

interface ToolActionsContextValue {
  /**
   * Set only where signing in would unlock unavailable tools (desktop while
   * signed out). When set, an 'endpointUnavailable' execute button becomes a
   * sign-in prompt that calls this; otherwise it stays disabled.
   */
  onEndpointUnavailableClick?: () => void;
}

export const ToolActionsContext = createContext<ToolActionsContextValue>({});

export function useToolActions(): ToolActionsContextValue {
  return useContext(ToolActionsContext);
}
