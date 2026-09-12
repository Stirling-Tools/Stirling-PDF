# macOS disk image artwork

`background.png` is a 1320 × 800 PNG tagged at 144 DPI, displayed by Finder
at 660 × 400 points. It contains only the ivory gradient, product name, and
drag arrow. Finder supplies the app icon, Applications link, and file labels.

Regenerate on macOS from the repository root:

```sh
swift frontend/editor/src-tauri/macos/dmg/generate-background.swift
```

The window size and icon centres are configured in `tauri.conf.json` under
`bundle.macOS.dmg`. Keep the arrow aligned with those positions when changing
the artwork. Finder adds its own title bar and may show user-enabled status
or path bars, so the bottom of the image deliberately contains no content.

The background remains light in either macOS appearance. No translated
instructions are baked into it.

Build normally with `task desktop:build`. For an already-built app, run
`npx tauri bundle --bundles dmg` from `frontend/editor`. CI must set
`TAURI_BUNDLER_DMG_IGNORE_CI=true`; otherwise Tauri skips saving the Finder
background and icon positions.
