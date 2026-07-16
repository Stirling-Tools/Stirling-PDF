declare module "*.css" {}

// Vite `?raw` suffix imports a file's contents as a string (used in preview.tsx
// to load the English translation TOML synchronously).
declare module "*?raw" {
  const content: string;
  export default content;
}
