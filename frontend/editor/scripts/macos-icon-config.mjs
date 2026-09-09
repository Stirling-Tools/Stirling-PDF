// Prints a `tauri build --config` override that drops the icon entries listed in
// tauri.macos.conf.json which are not on disk, or nothing when they all are.
//
// icons/macos/Assets.car is gitignored and only written by `task desktop:assets-car`
// when full Xcode 26+ is installed. The bundler resolves every bundle.icon entry and
// aborts with "<path> does not exist", so naming it unconditionally would break
// bundling on any Mac without Xcode 26 instead of falling back to app.icns.
//
// A merged config replaces the whole array (RFC 7386), so the override carries the
// entries that survived, and tauri applies later --config values last.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filters bundle.icon down to the entries that exist.
 *
 * @param {string[]} icons paths relative to src-tauri
 * @param {(icon: string) => boolean} exists
 * @returns {{ dropped: string[], config: string | null }} config is null when every
 * entry exists, so the committed configuration is used unchanged
 * @throws when no entry exists at all - a broken checkout, not a skipped build step
 */
export function pruneMissingIcons(icons, exists) {
  const kept = icons.filter((icon) => exists(icon));
  const dropped = icons.filter((icon) => !exists(icon));

  if (dropped.length === 0) {
    return { dropped, config: null };
  }
  if (kept.length === 0) {
    throw new Error(
      `none of the macOS bundle icons exist: ${icons.join(", ")}`,
    );
  }
  return { dropped, config: JSON.stringify({ bundle: { icon: kept } }) };
}

function main() {
  const srcTauri = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src-tauri",
  );
  const configPath = join(srcTauri, "tauri.macos.conf.json");
  const icons = JSON.parse(readFileSync(configPath, "utf8")).bundle?.icon ?? [];

  const { dropped, config } = pruneMissingIcons(icons, (icon) =>
    existsSync(join(srcTauri, icon)),
  );

  if (dropped.length > 0) {
    console.error(
      `Not built, dropping from the macOS bundle icons: ${dropped.join(", ")}`,
    );
  }
  if (config) {
    console.log(config);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }
}
