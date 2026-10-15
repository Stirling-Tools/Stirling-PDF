//! Moving bytes between PDFium's memory and ours. In wasm, PDFium is the host's
//! module with its own linear memory: a pointer it returns does not address
//! anything here, and a buffer it writes into must live in its memory, so the
//! host allocates and copies. Natively both share one address space.

#[cfg(target_arch = "wasm32")]
mod imports {
    #[link(wasm_import_module = "host")]
    unsafe extern "C" {
        pub fn copy_from_pdfium(src: *const u8, dst: *mut u8, len: usize);
        pub fn copy_to_pdfium(src: *const u8, dst: *mut u8, len: usize);
        /// Null when PDFium's allocator fails.
        pub fn pdfium_alloc(len: usize) -> *mut u8;
        pub fn pdfium_free(ptr: *mut u8);
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

/// A buffer in PDFium's memory, for the arguments PDFium reads or writes
/// through a pointer (strings, out-parameters). Freed on drop.
pub(crate) struct PdfiumBuffer {
    ptr: *mut u8,
    len: usize,
    #[cfg(not(target_arch = "wasm32"))]
    _storage: Box<[u8]>,
}

impl PdfiumBuffer {
    /// Uninitialised in wasm; `None` if PDFium's allocator fails.
    pub(crate) fn new(len: usize) -> Option<Self> {
        #[cfg(target_arch = "wasm32")]
        {
            // A zero-length malloc may return null, which would read as failure.
            let ptr = unsafe { imports::pdfium_alloc(len.max(1)) };
            (!ptr.is_null()).then_some(Self { ptr, len })
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let mut storage = vec![0u8; len.max(1)].into_boxed_slice();
            Some(Self {
                ptr: storage.as_mut_ptr(),
                len,
                _storage: storage,
            })
        }
    }

    pub(crate) fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let buffer = Self::new(bytes.len())?;
        unsafe { copy_to_pdfium(bytes, buffer.ptr) };
        Some(buffer)
    }

    /// The PDFium address to pass to a PDFium function, never dereferenced here.
    pub(crate) fn as_ptr(&self) -> *mut u8 {
        self.ptr
    }

    /// The first `len` bytes (at most the buffer's length).
    pub(crate) fn read(&self, len: usize) -> Vec<u8> {
        let mut bytes = vec![0; len.min(self.len)];
        unsafe { copy_from_pdfium(self.ptr, &mut bytes) };
        bytes
    }
}

impl Drop for PdfiumBuffer {
    fn drop(&mut self) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            imports::pdfium_free(self.ptr)
        }
    }
}
