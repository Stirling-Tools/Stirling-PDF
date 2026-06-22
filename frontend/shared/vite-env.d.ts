declare module "*.css" {}

// Vite resolves asset imports to a URL string. Declared here so the shared
// package type-checks on its own (apps get this via vite/client).
declare module "*.svg" {
  const src: string;
  export default src;
}
