# Windows PDF Thumbnail Handler

A lightweight COM DLL that provides PDF page-preview thumbnails in Windows Explorer when Stirling-PDF is the default PDF application.

## Why this exists

When Stirling-PDF registers as the default PDF handler, Windows associates `.pdf` files with Stirling's ProgID. Without a thumbnail handler on that ProgID, Explorer falls back to showing the application icon (the big S logo) instead of a page preview. This DLL restores thumbnail previews by implementing the Windows Shell `IThumbnailProvider` COM interface.

## How it works

1. **Explorer requests a thumbnail** — when a folder with PDFs is opened in Medium/Large icon view, Explorer loads the DLL via the registered COM CLSID.
2. **Shell calls `IInitializeWithStream`** — passes the PDF file content as an `IStream`.
3. **Shell calls `IThumbnailProvider::GetThumbnail(cx)`** — requests a bitmap of size `cx × cx`.
4. **The DLL renders page 1** using the built-in `Windows.Data.Pdf` WinRT API (the same engine Edge uses), preserving aspect ratio.
5. **WIC decodes the rendered PNG** into BGRA pixels, which are copied into an `HBITMAP` via `CreateDIBSection`.
6. **Explorer displays the bitmap** as the file's thumbnail.

All COM methods are wrapped in `catch_unwind` so a malformed PDF cannot crash Explorer.

## Preview pane (Alt+P)

The same DLL also implements `IPreviewHandler` (`src/preview.rs`) so the Explorer preview pane keeps working when Stirling-PDF is the default PDF app. Windows hosts it in `prevhost.exe`; it renders every page with `Windows.Data.Pdf` into a scrollable child window, lazily as pages scroll into view. Pages with a `/Rotate` entry display as their PDF says. Right-click offers view-only rotation of one page or all pages; the file is never modified.

It is registered on Stirling's own ProgIDs only (`Stirling PDF.pdf` and `Applications\Stirling-PDF.exe`), so an existing Adobe/Edge previewer on `.pdf` is left alone.

## Technical details

| | |
|---|---|
| **Language** | Rust (cdylib) |
| **DLL size** | ~156 KB |
| **External deps** | None — uses only Windows built-in APIs |
| **PDF renderer** | `Windows.Data.Pdf` (WinRT, Windows 10+) |
| **Image decode** | WIC (`IWICImagingFactory`) with BGRA32 format conversion |
| **COM CLSID** | `{2D2FBE3A-9A88-4308-A52E-7EF63CA7CF48}` (thumbnail), `{4175C0BD-22BB-466C-A099-721C6E8B8040}` (preview) |
| **Threading model** | Apartment (STA — standard for shell extensions) |
| **Min Windows** | Windows 10 |

## Registry entries (managed by MSI)

The WiX installer (`provisioning.wxs`) registers:

- **CLSID** at `HKLM\SOFTWARE\Classes\CLSID\{2D2FBE3A-...}\InprocServer32` pointing to the DLL
- **Shellex** at `HKLM\SOFTWARE\Classes\.pdf\shellex\{E357FCCD-...}` linking `.pdf` thumbnails to our CLSID
- **Preview CLSID** with `AppID` = prevhost surrogate, plus an entry in `HKLM\...\CurrentVersion\PreviewHandlers`
- **Shellex** `{8895b1c6-...}` on the `Stirling PDF.pdf` and `Applications\Stirling-PDF.exe` ProgIDs linking previews to our CLSID

Both are automatically removed on uninstall.

## Building

The DLL is built automatically as part of the Tauri build pipeline via `build-provisioner.mjs`:

```bash
cd frontend
npm run tauri-build
```

To build the DLL standalone:

```bash
cd frontend/src-tauri/thumbnail-handler
cargo build --release
# Output: target/release/stirling_thumbnail_handler.dll
```

## Linux / macOS

This DLL is Windows-only. Linux and macOS don't need it — their thumbnail systems (thumbnailers on Linux, Quick Look on macOS) are decoupled from the default app association and continue working regardless of which app is set as default.
