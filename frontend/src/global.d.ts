declare module "*.js";
declare module '*.module.css';

// Auto-generated icon set JSON import
declare module 'assets/material-symbols-icons.json' {
  const value: {
    prefix: string;
    icons: Record<string, any>;
    width?: number;
    height?: number;
  };
  export default value;
}

declare module '@embedpdf/plugin-redaction/react' {
  export const RedactionPluginPackage: any;
  export const RedactionLayer: any;
  export function useRedactionCapability(): { provides?: () => any } | undefined;
}

export {};
