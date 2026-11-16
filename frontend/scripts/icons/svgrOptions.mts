import type { Plugin } from "vite";
import svgr from "vite-plugin-svgr";

/**
 * The `?react` transform, configured the same way for the app build, Storybook and the tests.
 *
 * `prefixIds` namespaces ids per file, so two marks that both declare `clip0_1_2` cannot collide
 * once they are inline in the same document. `removeViewBox` stays off: `<Icon>` sets width and
 * height, and without a viewBox the artwork would not scale to them.
 */
export function iconSvgr(): Plugin {
  return svgr({
    svgrOptions: {
      svgoConfig: {
        plugins: [
          {
            name: "preset-default",
            params: { overrides: { removeViewBox: false } },
          },
          "prefixIds",
        ],
      },
    },
  });
}
