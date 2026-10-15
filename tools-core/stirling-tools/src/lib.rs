//! The MIT tools' C ABI: Java calls it through FFM, the browser through this
//! crate's wasm module. Documents are handles the host opened and still owns.
//! The conventions (statuses, errors, buffers, binding) are `stirling_abi`'s.

use std::ffi::{c_int, c_void};

use adjust_colors::{Adjustments, adjust_document, adjust_rgba};
use stirling_abi::{OK, fail};
use stirling_pdfium::Document;

stirling_abi::export_common!();

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

/// Adjusts `len` bytes of packed R, G, B, A pixels in place, leaving alpha as
/// it was. Needs no PDFium: it is the per-pixel step of
/// [`stirling_adjust_colors`], for previews.
///
/// # Safety
/// `pixels` must address `len` writable bytes in this library's memory (in
/// wasm, from `stirling_alloc`) that nothing else touches until this returns.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn stirling_adjust_rgba(
    pixels: *mut u8,
    len: usize,
    contrast: f64,
    brightness: f64,
    saturation: f64,
    red: f64,
    green: f64,
    blue: f64,
) -> c_int {
    if pixels.is_null() {
        return fail("the pixel buffer was null");
    }
    if len % 4 != 0 {
        return fail(format_args!(
            "{len} bytes is not a whole number of RGBA pixels"
        ));
    }
    // SAFETY: forwarded from this function's contract.
    let pixels = unsafe { std::slice::from_raw_parts_mut(pixels, len) };
    let adjustments = Adjustments {
        contrast,
        brightness,
        saturation,
        red,
        green,
        blue,
    };
    adjust_rgba(pixels, &adjustments);
    OK
}
