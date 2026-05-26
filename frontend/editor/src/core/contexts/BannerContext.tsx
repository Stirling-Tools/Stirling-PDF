import { createContext, useContext, useMemo, useState, ReactNode } from "react";

interface BannerContextType {
  banner: ReactNode;
  setBanner: (banner: ReactNode) => void;
}

const BannerContext = createContext<BannerContextType | undefined>(undefined);

export function BannerProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<ReactNode>(null);

  const value = useMemo(() => ({ banner, setBanner }), [banner]);

  return (
    <BannerContext.Provider value={value}>{children}</BannerContext.Provider>
  );
}

export function useBanner() {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error("useBanner must be used within BannerProvider");
  }
  return context;
}
