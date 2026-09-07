// Shorthand (no body) so it doesn't shadow the editor's `*.module.css`
// declaration when both are in one program - an empty body would type every
// CSS-module class as a missing property.
declare module "*.css";

// Vite `?raw` suffix imports a file's contents as a string (used in preview.tsx
// to load the English translation TOML synchronously).
declare module "*?raw" {
  const content: string;
  export default content;
}
