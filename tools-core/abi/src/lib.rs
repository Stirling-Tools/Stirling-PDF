//! The C ABI conventions every tools-core library shares, so hosts drive each
//! the same way. An operation returns [`OK`] or [`FAILED`]; after a failure
//! `stirling_last_error` says why, and an operation that produces a result
//! leaves it in `stirling_last_result`. Both are per thread.
//!
//! A library exports these by invoking [`export_common!`] once.

use std::cell::RefCell;
use std::ffi::{CString, c_char, c_int};
use std::fmt::Display;

pub const OK: c_int = 0;
pub const FAILED: c_int = -1;

thread_local! {
    static LAST_ERROR: RefCell<CString> = RefCell::new(CString::default());
    static LAST_RESULT: RefCell<CString> = RefCell::new(CString::default());
}

fn store(slot: &'static std::thread::LocalKey<RefCell<CString>>, text: String) {
    let text = CString::new(text).unwrap_or_default();
    slot.with(|cell| *cell.borrow_mut() = text);
}

/// Records `message` as the last error and returns [`FAILED`].
pub fn fail(message: impl Display) -> c_int {
    store(&LAST_ERROR, message.to_string());
    FAILED
}

/// Records `result` (JSON, by convention) as the last result and returns [`OK`].
pub fn succeed_with(result: String) -> c_int {
    store(&LAST_RESULT, result);
    OK
}

pub fn last_error() -> *const c_char {
    LAST_ERROR.with(|cell| cell.borrow().as_ptr())
}

pub fn last_result() -> *const c_char {
    LAST_RESULT.with(|cell| cell.borrow().as_ptr())
}

/// The UTF-8 string the host passed as `ptr` and `len`, or a failure message.
///
/// # Safety
/// `ptr` must address `len` readable bytes in this library's memory (in wasm,
/// from `stirling_alloc`) that stay unchanged while the result is in use.
pub unsafe fn str_arg<'a>(ptr: *const u8, len: usize) -> Result<&'a str, String> {
    if len == 0 {
        return Ok("");
    }
    if ptr.is_null() {
        return Err("a string argument was null".into());
    }
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(bytes).map_err(|error| format!("a string argument was not UTF-8: {error}"))
}

pub fn alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>()
}

/// # Safety
/// `ptr` and `len` must be one [`alloc`] call's result and argument, and the
/// buffer must not be used afterwards.
pub unsafe fn free(ptr: *mut u8, len: usize) {
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) });
}

#[cfg(not(target_arch = "wasm32"))]
pub fn bind(resolve: extern "C" fn(*const c_char) -> *const std::ffi::c_void) -> c_int {
    match stirling_pdfium::bind(|name| resolve(name.as_ptr())) {
        Ok(()) => OK,
        Err(missing) => fail(format_args!(
            "PDFium symbol {missing} could not be resolved"
        )),
    }
}

/// Defines the shared entry points in the invoking library crate.
#[macro_export]
macro_rules! export_common {
    () => {
        /// Why the last call on this thread failed: a nul-terminated UTF-8
        /// string, valid until the next call into this library on the thread.
        #[unsafe(no_mangle)]
        pub extern "C" fn stirling_last_error() -> *const ::std::ffi::c_char {
            $crate::last_error()
        }

        /// The last successful call's result on this thread, as nul-terminated
        /// UTF-8 JSON; same lifetime as `stirling_last_error`.
        #[unsafe(no_mangle)]
        pub extern "C" fn stirling_last_result() -> *const ::std::ffi::c_char {
            $crate::last_result()
        }

        /// A zeroed `len`-byte buffer in this module's memory, for the host to
        /// fill before a call that takes bytes. Release it with `stirling_free`.
        #[cfg(target_arch = "wasm32")]
        #[unsafe(no_mangle)]
        pub extern "C" fn stirling_alloc(len: usize) -> *mut u8 {
            $crate::alloc(len)
        }

        /// # Safety
        /// `ptr` and `len` must be one `stirling_alloc` call's result and
        /// argument, and the buffer must not be used afterwards.
        #[cfg(target_arch = "wasm32")]
        #[unsafe(no_mangle)]
        pub unsafe extern "C" fn stirling_free(ptr: *mut u8, len: usize) {
            unsafe { $crate::free(ptr, len) }
        }

        /// Binds the PDFium functions natively. `resolve` maps a nul-terminated
        /// symbol name to its address in the PDFium the host already loaded, or
        /// null. Call once, before anything else.
        #[cfg(not(target_arch = "wasm32"))]
        #[unsafe(no_mangle)]
        pub extern "C" fn stirling_tools_bind(
            resolve: extern "C" fn(*const ::std::ffi::c_char) -> *const ::std::ffi::c_void,
        ) -> ::std::ffi::c_int {
            $crate::bind(resolve)
        }
    };
}
