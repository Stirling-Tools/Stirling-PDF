//! Raw PDFium declarations, written once and expanded per target: imports from
//! the host's PDFium module in wasm, a table bound at runtime natively.

#![allow(non_camel_case_types, non_snake_case)]

use std::ffi::{c_char, c_double, c_float, c_int, c_uint, c_ulong, c_ushort, c_void};

pub type FPDF_DOCUMENT = *mut c_void;
pub type FPDF_PAGE = *mut c_void;
pub type FPDF_BITMAP = *mut c_void;
pub type FPDF_PAGEOBJECT = *mut c_void;
pub type FPDF_TEXTPAGE = *mut c_void;
pub type FPDF_BOOL = c_int;
pub type FPDF_DWORD = c_ulong;

pub const FPDF_ANNOT: c_int = 0x01;

macro_rules! pdfium_functions {
    ($( fn $name:ident($($arg:ident: $ty:ty),* $(,)?) $(-> $ret:ty)?; )*) => {
        #[cfg(target_arch = "wasm32")]
        #[link(wasm_import_module = "pdfium")]
        unsafe extern "C" {
            $( pub fn $name($($arg: $ty),*) $(-> $ret)?; )*
        }

        #[cfg(not(target_arch = "wasm32"))]
        struct Table {
            $( $name: unsafe extern "C" fn($($ty),*) $(-> $ret)?, )*
        }

        #[cfg(not(target_arch = "wasm32"))]
        static TABLE: std::sync::OnceLock<Table> = std::sync::OnceLock::new();

        $(
            #[cfg(not(target_arch = "wasm32"))]
            #[allow(clippy::too_many_arguments)]
            pub unsafe fn $name($($arg: $ty),*) $(-> $ret)? {
                let table = TABLE.get().expect("PDFium called before bind");
                unsafe { (table.$name)($($arg),*) }
            }
        )*

        /// Binds every function through `resolve`, which maps a symbol name to its
        /// address in the host's already-loaded PDFium, so both share one PDFium
        /// instance. Fails with the first name `resolve` returns null for. Only
        /// the first successful bind takes effect.
        #[cfg(not(target_arch = "wasm32"))]
        pub fn bind(
            resolve: impl Fn(&std::ffi::CStr) -> *const c_void,
        ) -> Result<(), &'static str> {
            let table = Table {
                $( $name: {
                    let name = concat!(stringify!($name), "\0");
                    let symbol = std::ffi::CStr::from_bytes_with_nul(name.as_bytes())
                        .expect("literal has exactly one trailing nul");
                    let address = resolve(symbol);
                    if address.is_null() {
                        return Err(stringify!($name));
                    }
                    // SAFETY: the declaration below matches PDFium's public header for
                    // this symbol, and the host resolved it from that PDFium.
                    unsafe {
                        std::mem::transmute::<*const c_void, unsafe extern "C" fn($($ty),*) $(-> $ret)?>(
                            address,
                        )
                    }
                }, )*
            };
            let _ = TABLE.set(table);
            Ok(())
        }

        #[cfg(not(target_arch = "wasm32"))]
        pub fn is_bound() -> bool {
            TABLE.get().is_some()
        }

        #[cfg(target_arch = "wasm32")]
        pub fn is_bound() -> bool {
            true
        }
    };
}

pdfium_functions! {
    fn FPDF_GetPageCount(document: FPDF_DOCUMENT) -> c_int;
    fn FPDF_GetMetaText(
        document: FPDF_DOCUMENT,
        tag: *const c_char,
        buffer: *mut c_void,
        buflen: c_ulong,
    ) -> c_ulong;
    fn EPDF_SetMetaText(
        document: FPDF_DOCUMENT,
        tag: *const c_char,
        value: *const c_ushort,
    ) -> FPDF_BOOL;
    fn FPDF_LoadPage(document: FPDF_DOCUMENT, page_index: c_int) -> FPDF_PAGE;
    fn FPDF_ClosePage(page: FPDF_PAGE);
    fn FPDF_GetPageWidthF(page: FPDF_PAGE) -> c_float;
    fn FPDF_GetPageHeightF(page: FPDF_PAGE) -> c_float;
    fn FPDF_RenderPageBitmap(
        bitmap: FPDF_BITMAP,
        page: FPDF_PAGE,
        start_x: c_int,
        start_y: c_int,
        size_x: c_int,
        size_y: c_int,
        rotate: c_int,
        flags: c_int,
    );
    fn FPDFBitmap_Create(width: c_int, height: c_int, alpha: c_int) -> FPDF_BITMAP;
    fn FPDFBitmap_FillRect(
        bitmap: FPDF_BITMAP,
        left: c_int,
        top: c_int,
        width: c_int,
        height: c_int,
        color: FPDF_DWORD,
    ) -> FPDF_BOOL;
    fn FPDFBitmap_GetBuffer(bitmap: FPDF_BITMAP) -> *mut c_void;
    fn FPDFBitmap_GetStride(bitmap: FPDF_BITMAP) -> c_int;
    fn FPDFBitmap_Destroy(bitmap: FPDF_BITMAP);
    fn FPDFPage_New(
        document: FPDF_DOCUMENT,
        page_index: c_int,
        width: c_double,
        height: c_double,
    ) -> FPDF_PAGE;
    fn FPDFPage_InsertObject(page: FPDF_PAGE, page_object: FPDF_PAGEOBJECT);
    fn FPDFPage_GenerateContent(page: FPDF_PAGE) -> FPDF_BOOL;
    fn FPDFPageObj_NewImageObj(document: FPDF_DOCUMENT) -> FPDF_PAGEOBJECT;
    fn FPDFPageObj_Transform(
        page_object: FPDF_PAGEOBJECT,
        a: c_double,
        b: c_double,
        c: c_double,
        d: c_double,
        e: c_double,
        f: c_double,
    );
    fn FPDFPageObj_Destroy(page_object: FPDF_PAGEOBJECT);
    fn FPDFText_LoadPage(page: FPDF_PAGE) -> FPDF_TEXTPAGE;
    fn FPDFText_ClosePage(text_page: FPDF_TEXTPAGE);
    fn FPDFText_CountChars(text_page: FPDF_TEXTPAGE) -> c_int;
    fn FPDFText_GetText(
        text_page: FPDF_TEXTPAGE,
        start_index: c_int,
        count: c_int,
        result: *mut c_ushort,
    ) -> c_int;
    fn FPDFText_GetUnicode(text_page: FPDF_TEXTPAGE, index: c_int) -> c_uint;
    fn FPDFText_GetFontSize(text_page: FPDF_TEXTPAGE, index: c_int) -> c_double;
    fn FPDFText_GetCharOrigin(
        text_page: FPDF_TEXTPAGE,
        index: c_int,
        x: *mut c_double,
        y: *mut c_double,
    ) -> FPDF_BOOL;
    fn FPDFImageObj_SetBitmap(
        pages: *mut FPDF_PAGE,
        count: c_int,
        image_object: FPDF_PAGEOBJECT,
        bitmap: FPDF_BITMAP,
    ) -> FPDF_BOOL;
}
