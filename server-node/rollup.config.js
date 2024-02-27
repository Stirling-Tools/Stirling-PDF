import run from "@rollup/plugin-run";
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import compileTime from "vite-plugin-compile-time";
import dynamicImportVars from '@rollup/plugin-dynamic-import-vars';

const isDev = process.env.NODE_ENV !== "production";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist/",
    format: "es",
    strict: false,
  },
  watch: {
    include: [ './src/**', '../shared-operations/src/**' ]
  },
  plugins: [
    compileTime(),
    json(),
    typescript(),
    dynamicImportVars({errorWhenNoFilesFound: true, warnOnError: true}),
    copy({
        targets: [
            { src: '../shared-operations/public', dest: 'dist' },
        ]
    }),
    isDev && run()
  ],
};