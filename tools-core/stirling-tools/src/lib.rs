//! The C ABI the hosts call: Java through FFM, the browser through this crate's
//! wasm module. Documents are handles the host opened and still owns. Every
//! function returns [`OK`] or [`FAILED`], and after a failure
//! [`stirling_last_error`] says why.

use std::cell::RefCell;
use std::ffi::{CString, c_char, c_int, c_void};
use std::fmt::Display;

use adjust_colors::{Adjustments, adjust_document};
use stirling_pdfium::Document;

const OK: c_int = 0;
const FAILED: c_int = -1;

thread_local! {
    static LAST_ERROR: RefCell<CString> = RefCell::new(CString::default());
}

fn fail(message: impl Display) -> c_int {
    let message = CString::new(message.to_string()).unwrap_or_default();
    LAST_ERROR.with(|last| *last.borrow_mut() = message);
    FAILED
}

/// Why the last call on this thread failed: a nul-terminated UTF-8 string, valid
/// until the next call into this library on the same thread.
#[unsafe(no_mangle)]
pub extern "C" fn stirling_last_error() -> *const c_char {
    LAST_ERROR.with(|last| last.borrow().as_ptr())
}

/// Appends an adjusted image of each page of `source` to the empty document
/// `target`. Both stay open; the host saves `target` and closes both.
///
/// # Safety
/// Each handle must be null or an open document the host keeps open, and
/// makes no other PDFium call on, until this returns.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn stirling_adjust_colors(
    source: *mut c_void,
    target: *mut c_void,
    contrast: f64,
    brightness: f64,
    saturation: f64,
    red: f64,
    green: f64,
    blue: f64,
) -> c_int {
    if !stirling_pdfium::is_bound() {
        return fail("PDFium is not bound: call stirling_tools_bind first");
    }
    // SAFETY: forwarded from this function's contract.
    let documents = unsafe { (Document::from_raw(source), Document::from_raw(target)) };
    let (Some(source), Some(target)) = documents else {
        return fail("a document handle was null");
    };
    let adjustments = Adjustments {
        contrast,
        brightness,
        saturation,
        red,
        green,
        blue,
    };
    match adjust_document(&source, &target, &adjustments) {
        Ok(()) => OK,
        Err(error) => fail(error),
    }
}

/// Binds the PDFium functions natively. `resolve` maps a nul-terminated symbol
/// name to its address in the PDFium the host already loaded, or null. Call
/// once, before anything else.
#[cfg(not(target_arch = "wasm32"))]
#[unsafe(no_mangle)]
pub extern "C" fn stirling_tools_bind(
    resolve: extern "C" fn(*const c_char) -> *const c_void,
) -> c_int {
    match stirling_pdfium::bind(|name| resolve(name.as_ptr())) {
        Ok(()) => OK,
        Err(missing) => fail(format_args!(
            "PDFium symbol {missing} could not be resolved"
        )),
    }
}
