# `mobile/` layer (iOS / Android via Tauri)

Leaf layer for the Tauri mobile build. Resolution order for `@app/*`:

    mobile -> tauri -> cloud -> proprietary -> core

`mobile/` is a sibling of `desktop/`, not a layer on top of it: nothing from
`desktop/` is in the mobile build. The bundled Java backend does not exist on
mobile (the Rust commands are stubbed in `src-tauri/src/commands/mobile_stubs.rs`),
so the app is a client of a remote Stirling server: SaaS or self-hosted.

This layer provides the bundled-backend seams `tauri/` imports
(`services/tauriBackendService`, `services/operationRouter`,
`hooks/useBackendInitializer`) and shadows the web defaults that cannot work on
a phone: file pickers, saving, server health.

Rules:
- Import via `@app/*`. Use `@tauri/*` or `@core/*` only when wrapping the
  implementation you are overriding.
- Tauri APIs are allowed here, like in `tauri/` and `desktop/`.
- Never check the platform at runtime; shadow the module instead.
- Code that both mobile and desktop need belongs in `tauri/`, never copied.

Build: `task mobile:ios:dev` (see `.taskfiles/mobile.yml`).
