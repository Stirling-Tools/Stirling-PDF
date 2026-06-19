declare module "*.css" {
  // Default export is the CSS-module class map; side-effect imports ignore it.
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
