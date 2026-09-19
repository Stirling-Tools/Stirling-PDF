import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pruneMissingIcons } from "./macos-icon-config.mjs";

const ICONS = [
  "icons/macos/app.icns",
  "icons/macos/app-512.png",
  "icons/macos/Assets.car",
];

const present =
  (...paths) =>
  (icon) =>
    paths.includes(icon);

describe("pruneMissingIcons", () => {
  it("asks for no override when every icon exists", () => {
    expect(pruneMissingIcons(ICONS, present(...ICONS))).toEqual({
      dropped: [],
      config: null,
    });
  });

  it("drops an Assets.car that was never compiled", () => {
    const { dropped, config } = pruneMissingIcons(
      ICONS,
      present("icons/macos/app.icns", "icons/macos/app-512.png"),
    );

    expect(dropped).toEqual(["icons/macos/Assets.car"]);
    expect(JSON.parse(config)).toEqual({
      bundle: { icon: ["icons/macos/app.icns", "icons/macos/app-512.png"] },
    });
  });

  it("fails when nothing is left to bundle", () => {
    expect(() => pruneMissingIcons(ICONS, present())).toThrow(
      /none of the macOS bundle icons exist/,
    );
  });

  it("prunes the committed macOS bundle icons", () => {
    const configPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src-tauri",
      "tauri.macos.conf.json",
    );
    const icons = JSON.parse(readFileSync(configPath, "utf8")).bundle.icon;

    const { config } = pruneMissingIcons(
      icons,
      (icon) => !icon.endsWith("Assets.car"),
    );

    expect(icons).toContain("icons/macos/Assets.car");
    expect(JSON.parse(config).bundle.icon).toEqual(
      icons.filter((icon) => !icon.endsWith("Assets.car")),
    );
  });
});
