//! Scans paper documents to a PDF with the platform's own scanner: VisionKit on
//! iOS, the ML Kit document scanner on Android.
//!
//! `scan` is implemented natively and called from JavaScript as
//! `plugin:document-scanner|scan`. It resolves to `{ path }`, a PDF in the app's
//! temporary storage that the caller owns and should delete, or to
//! `{ path: null }` when the user cancels. Desktop builds do not register it.

use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_document_scanner);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("document-scanner")
    .setup(|_app, api| {
      #[cfg(target_os = "android")]
      api.register_android_plugin("stirling.pdf.documentscanner", "DocumentScannerPlugin")?;
      #[cfg(target_os = "ios")]
      api.register_ios_plugin(init_plugin_document_scanner)?;
      #[cfg(not(any(target_os = "android", target_os = "ios")))]
      let _ = api;
      Ok(())
    })
    .build()
}
