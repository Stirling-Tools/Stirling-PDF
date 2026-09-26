#!/usr/bin/env node
// Stages the bootJar the desktop bundle expects under src-tauri/libs.
//
// The backend build leaves every version it ever produced in build/libs, and
// tauri.conf.json bundles the whole libs/*.jar glob, so the newest artifact has
// to be picked explicitly and the previous one removed.
//
// Usage: stage-backend-jar.mjs <sourceDir> <destDir>
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const [sourceDir, destDir] = process.argv.slice(2);

const jarsIn = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).filter((name) => /^stirling-pdf-.*\.jar$/.test(name))
    : [];

const newestJar = (dir) => {
  const jars = jarsIn(dir);
  if (jars.length === 0) return null;
  return jars
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
};

const source = newestJar(sourceDir);
const staged = jarsIn(destDir);

if (!source) {
  console.error(`No stirling-pdf-*.jar found in ${sourceDir}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
for (const name of staged) {
  rmSync(join(destDir, name), { force: true });
}
copyFileSync(join(sourceDir, source.name), join(destDir, source.name));
console.log(`Staged ${source.name} in ${destDir}`);
