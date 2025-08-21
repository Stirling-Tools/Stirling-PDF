// /**
//  * ToolNavigationContext - Handles tool selection and navigation without tool registry
//  * This breaks the circular dependency by not importing the tool registry
//  */

// import React, { createContext, useContext, useState, useCallback } from 'react';
// import { useFileContext } from './FileContext';

// // Navigation state interface
// interface ToolNavigationState {
//   selectedToolKey: string | null;
// }

// // Context value interface
// interface ToolNavigationContextValue extends ToolNavigationState {
//   // Navigation Actions
//   selectTool: (toolKey: string) => void;
//   clearToolSelection: () => void;
//   handleToolSelect: (toolId: string) => void;
// }

// const ToolNavigationContext = createContext<ToolNavigationContextValue | undefined>(undefined);

// // Provider component
// interface ToolNavigationProviderProps {
//   children: React.ReactNode;
// }

// export function ToolNavigationProvider({ children }: ToolNavigationProviderProps) {
//   const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
//   const { setCurrentView } = useFileContext();

//   const selectTool = useCallback((toolKey: string) => {
//     setSelectedToolKey(toolKey);
//   }, []);

//   const clearToolSelection = useCallback(() => {
//     setSelectedToolKey(null);
//   }, []);

//   const handleToolSelect = useCallback((toolId: string) => {
//     // Handle special cases
//     if (toolId === 'allTools') {
//       clearToolSelection();
//       return;
//     }

//     selectTool(toolId);
//     setCurrentView('fileEditor');
//   }, [selectTool, setCurrentView, clearToolSelection]);

//   const contextValue: ToolNavigationContextValue = {
//     selectedToolKey,
//     selectTool,
//     clearToolSelection,
//     handleToolSelect
//   };

//   return (
//     <ToolNavigationContext.Provider value={contextValue}>
//       {children}
//     </ToolNavigationContext.Provider>
//   );
// }

// // Custom hook to use the context
// export function useToolNavigation(): ToolNavigationContextValue {
//   const context = useContext(ToolNavigationContext);
//   if (!context) {
//     // During development hot reload, temporarily return a safe fallback
//     if (process.env.NODE_ENV === 'development') {
//       console.warn('ToolNavigationContext temporarily unavailable during hot reload, using fallback');

//       return {
//         selectedToolKey: null,
//         selectTool: () => {},
//         clearToolSelection: () => {},
//         handleToolSelect: () => {}
//       } as ToolNavigationContextValue;
//     }

//     throw new Error('useToolNavigation must be used within a ToolNavigationProvider');
//   }
//   return context;
// }
