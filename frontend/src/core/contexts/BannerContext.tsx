import { createContext, useContext, useState, ReactNode } from 'react';

interface BannerContextType {
  banner: ReactNode;
  setBanner: (banner: ReactNode) => void;
}

const BannerContext = createContext<BannerContextType | undefined>(undefined);

export function BannerProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<ReactNode>(null);

  return (
    <BannerContext.Provider value={{ banner, setBanner }}>
      {children}
    </BannerContext.Provider>
  );
}

export function useBanner() {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error('useBanner must be used within BannerProvider');
  }
  return context;
}
