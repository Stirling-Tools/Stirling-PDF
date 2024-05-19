import { defineConfig } from 'vite';
import topLevelAwait from "vite-plugin-top-level-await";
import dynamicImport from 'vite-plugin-dynamic-import'
import compileTime from "vite-plugin-compile-time"
import { VitePluginNode } from 'vite-plugin-node';

export default defineConfig({
  // ...vite configures
  server: {
    // vite server configs, for details see [vite doc](https://vitejs.dev/config/#server-host)
    port: 8000
  },
  plugins: [
    ...VitePluginNode({
        // Nodejs native Request adapter
        // currently this plugin support 'express', 'nest', 'koa' and 'fastify' out of box,
        // you can also pass a function if you are using other frameworks, see Custom Adapter section
        adapter: 'express',

        // tell the plugin where is your project entry
        appPath: './src/index.ts',

        // Optional, default: false
        // if you want to init your app on boot, set this to true
        initAppOnBoot: true,
    }),
    topLevelAwait({
        // The export name of top-level await promise for each chunk module
        promiseExportName: "__tla",
        // The function to generate import names of top-level await promise in each chunk module
        promiseImportName: i => `__tla_${i}`
    }),
    compileTime(),
    dynamicImport(),
  ],
});