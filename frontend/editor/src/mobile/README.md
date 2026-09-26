# `mobile/` layer (iOS / Android via Tauri)

Leaf layer for the Tauri mobile build. Resolution order for `@app/*`:

    mobile -> desktop -> cloud -> proprietary -> core

**Spike state.** Mobile currently inherits the whole `desktop/` layer and only
shadows what cannot work on a phone. The bundled Java backend does not exist on
mobile (the Rust commands are stubbed in `src-tauri/src/commands/mobile_stubs.rs`),
so the app is a client of a remote Stirling server: SaaS or self-hosted.

**Target state.** Platform-neutral Tauri code (HTTP transport, token store,
connection mode, endpoint availability, SaaS config) moves out of `desktop/`
into a shared `native/` layer, after which the cascade becomes
`mobile -> native -> cloud -> proprietary -> core` and `desktop/` keeps only
desktop concerns (bundled backend, updater, multi-window, printing).

Rules:
- Import via `@app/*`. Use `@desktop/*` only when wrapping the desktop
  implementation you are overriding (same rule as `@core/*`).
- Tauri APIs are allowed here, like in `desktop/`.
- Never check the platform at runtime; shadow the module instead.

Build: `task mobile:ios:dev` (see `.taskfiles/mobile.yml`).
