import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ViewerContextType {
  // Thumbnail sidebar state
  isThumbnailSidebarVisible: boolean;
  toggleThumbnailSidebar: () => void;
  setThumbnailSidebarVisible: (visible: boolean) => void;
}

const ViewerContext = createContext<ViewerContextType | null>(null);

interface ViewerProviderProps {
  children: ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  const [isThumbnailSidebarVisible, setIsThumbnailSidebarVisible] = useState(false);

  const toggleThumbnailSidebar = () => {
    setIsThumbnailSidebarVisible(prev => !prev);
  };

  const setThumbnailSidebarVisible = (visible: boolean) => {
    setIsThumbnailSidebarVisible(visible);
  };

  const value: ViewerContextType = {
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    setThumbnailSidebarVisible,
  };

  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
};

export const useViewer = (): ViewerContextType => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within a ViewerProvider');
  }
  return context;
};