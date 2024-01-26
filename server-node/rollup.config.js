import run from "@rollup/plugin-run";
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy'


const isDev = process.env.NODE_ENV !== "production";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/bundle.js",
    format: "es",
  },
  watch: {
    include: [ './src/**', '../shared-operations/src/**' ]
  },
  plugins: [
    json(),
    typescript(),
    copy({
        targets: [
            { src: '../shared-operations/public', dest: 'dist' },
        ]
    }),
    isDev && run()
  ],
};