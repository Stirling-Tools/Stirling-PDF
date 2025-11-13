import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface InviteModalContextType {
  isInviteModalOpen: boolean;
  openInviteModal: () => void;
  closeInviteModal: () => void;
}

const InviteModalContext = createContext<InviteModalContextType | null>(null);

export function InviteModalProvider({ children }: { children: ReactNode }) {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const openInviteModal = useCallback(() => {
    setIsInviteModalOpen(true);
  }, []);

  const closeInviteModal = useCallback(() => {
    setIsInviteModalOpen(false);
  }, []);

  return (
    <InviteModalContext.Provider value={{ isInviteModalOpen, openInviteModal, closeInviteModal }}>
      {children}
    </InviteModalContext.Provider>
  );
}

export function useInviteModal(): InviteModalContextType {
  const context = useContext(InviteModalContext);
  if (!context) {
    throw new Error('useInviteModal must be used within InviteModalProvider');
  }
  return context;
}

