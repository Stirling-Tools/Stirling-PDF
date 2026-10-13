import type { Plugin } from "vite";
import svgr from "vite-plugin-svgr";

/**
 * The `?react` transform, configured the same way for the app build, Storybook and the tests.
 *
 * `prefixIds` namespaces ids per file, so two marks that both declare `clip0_1_2` cannot collide
 * once they are inline in the same document. `preset-default` keeps the viewBox, which `<Icon>`
 * needs to scale the artwork to the width and height it sets.
 */
export function iconSvgr(): Plugin {
  return svgr({
    svgrOptions: {
      svgoConfig: {
        plugins: ["preset-default", "prefixIds"],
      },
    },
  });
}
