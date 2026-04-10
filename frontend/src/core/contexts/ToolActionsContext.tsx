import { createContext, useContext } from "react";

interface ToolActionsContextValue {
  /**
   * Called when the user clicks the disabled execute button while the reason
   * is 'endpointUnavailable'. Desktop provides a sign-in modal dispatch;
   * web builds leave this undefined (button stays disabled with tooltip only).
   */
  onEndpointUnavailableClick?: () => void;
}

export const ToolActionsContext = createContext<ToolActionsContextValue>({});

export function useToolActions(): ToolActionsContextValue {
  return useContext(ToolActionsContext);
}
