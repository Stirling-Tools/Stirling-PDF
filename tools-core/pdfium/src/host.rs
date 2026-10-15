//! Copies between PDFium's memory and ours. In wasm, PDFium is the host's
//! module with its own linear memory: a pointer it returns does not address
//! anything here, so the host performs the copy.

#[cfg(target_arch = "wasm32")]
mod imports {
    #[link(wasm_import_module = "host")]
    unsafe extern "C" {
        pub fn copy_from_pdfium(src: *const u8, dst: *mut u8, len: usize);
        pub fn copy_to_pdfium(src: *const u8, dst: *mut u8, len: usize);
    }
}

/// # Safety
/// `src` must address `dst.len()` readable bytes of PDFium's memory.
pub(crate) unsafe fn copy_from_pdfium(src: *const u8, dst: &mut [u8]) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        imports::copy_from_pdfium(src, dst.as_mut_ptr(), dst.len())
    }
    #[cfg(not(target_arch = "wasm32"))]
    unsafe {
        std::ptr::copy_nonoverlapping(src, dst.as_mut_ptr(), dst.len())
    }
}

/// # Safety
/// `dst` must address `src.len()` writable bytes of PDFium's memory.
pub(crate) unsafe fn copy_to_pdfium(src: &[u8], dst: *mut u8) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        imports::copy_to_pdfium(src.as_ptr(), dst, src.len())
    }
    #[cfg(not(target_arch = "wasm32"))]
    unsafe {
        std::ptr::copy_nonoverlapping(src.as_ptr(), dst, src.len())
    }
}
