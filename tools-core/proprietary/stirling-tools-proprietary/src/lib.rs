//! The proprietary tools' C ABI: Java calls it through FFM, the browser
//! through this crate's wasm module. Documents are handles the host opened and
//! still owns. The conventions (statuses, errors, results, buffers, binding)
//! are `stirling_abi`'s.

use std::ffi::{c_int, c_void};

use stirling_abi::{fail, succeed_with};
use stirling_pdfium::Document;

stirling_abi::export_common!();

/// Classifies `document`; its verdict, as JSON, is the last result. With
/// `record` non-zero the verdict is also stored in the document's metadata,
/// for the host to save.
///
/// # Safety
/// `document` must be null or an open document the host keeps open, and makes
/// no other PDFium call on, until this returns. `file_name` must address
/// `file_name_len` bytes of UTF-8 in this library's memory (in wasm, from
/// `stirling_alloc`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn stirling_classify(
    document: *mut c_void,
    file_name: *const u8,
    file_name_len: usize,
    record: c_int,
) -> c_int {
    if !stirling_pdfium::is_bound() {
        return fail("PDFium is not bound: call stirling_tools_bind first");
    }
    // SAFETY: forwarded from this function's contract.
    let Some(document) = (unsafe { Document::from_raw(document) }) else {
        return fail("the document handle was null");
    };
    // SAFETY: forwarded from this function's contract.
    let file_name = match unsafe { stirling_abi::str_arg(file_name, file_name_len) } {
        Ok(name) => name,
        Err(message) => return fail(message),
    };
    let features = match classify::extract(&document, file_name) {
        Ok(features) => features,
        Err(error) => return fail(error),
    };
    let verdict = classify::classify(&features);
    if record != 0
        && let Err(error) = classify::record(&document, &verdict)
    {
        return fail(error);
    }
    match serde_json::to_string(&verdict) {
        Ok(json) => succeed_with(json),
        Err(error) => fail(error),
    }
}
