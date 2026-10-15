//! Safe PDFium API for tools that run both natively (called from Java) and in
//! the browser (wasm, called from TS). The only crate in tools-core with
//! `unsafe`; tool crates forbid it.
//!
//! The host owns PDFium: it initialises the library, opens and saves documents,
//! and serialises every call, because PDFium is not thread-safe. Natively the
//! functions are bound at runtime to the host's own PDFium ([`bind`]); in wasm
//! they are imports satisfied by the host's PDFium module, whose memory is not
//! ours, so pixel data crosses only through [`Bitmap::read_pixels`] and
//! [`Bitmap::write_pixels`].

mod ffi;
mod host;

use std::ffi::{c_int, c_void};
use std::fmt;
use std::marker::PhantomData;
use std::mem::ManuallyDrop;
use std::ptr;

#[cfg(not(target_arch = "wasm32"))]
pub use ffi::bind;
pub use ffi::is_bound;

/// A failed PDFium call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    LoadPage(usize),
    CreatePage(usize),
    CreateBitmap,
    CreateImage,
    SetBitmap,
    GenerateContent,
    PixelBufferSize,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::LoadPage(index) => write!(f, "could not load page {}", index + 1),
            Error::CreatePage(index) => write!(f, "could not create page {}", index + 1),
            Error::CreateBitmap => f.write_str("could not allocate a bitmap"),
            Error::CreateImage => f.write_str("could not create an image object"),
            Error::SetBitmap => f.write_str("could not set an image's bitmap"),
            Error::GenerateContent => f.write_str("could not write a page's content stream"),
            Error::PixelBufferSize => f.write_str("pixel buffer does not match the bitmap"),
        }
    }
}

impl std::error::Error for Error {}

/// A document the host opened and will close. Only borrowed here: dropping it
/// leaves the document open.
pub struct Document {
    raw: ffi::FPDF_DOCUMENT,
}

impl Document {
    /// `None` for a null handle.
    ///
    /// # Safety
    /// `raw` must be an open `FPDF_DOCUMENT` that stays open, and that nothing
    /// else uses, until the returned value and everything borrowed from it drop.
    pub unsafe fn from_raw(raw: *mut c_void) -> Option<Self> {
        (!raw.is_null()).then_some(Self { raw })
    }

    pub fn page_count(&self) -> usize {
        let count = unsafe { ffi::FPDF_GetPageCount(self.raw) };
        usize::try_from(count).unwrap_or(0)
    }

    pub fn page(&self, index: usize) -> Result<Page<'_>, Error> {
        let page_index = c_int::try_from(index).map_err(|_| Error::LoadPage(index))?;
        let raw = unsafe { ffi::FPDF_LoadPage(self.raw, page_index) };
        Page::from_raw(raw).ok_or(Error::LoadPage(index))
    }

    /// Inserts a blank page at `index`, sized in points.
    pub fn insert_page(&self, index: usize, width: f64, height: f64) -> Result<Page<'_>, Error> {
        let page_index = c_int::try_from(index).map_err(|_| Error::CreatePage(index))?;
        let raw = unsafe { ffi::FPDFPage_New(self.raw, page_index, width, height) };
        Page::from_raw(raw).ok_or(Error::CreatePage(index))
    }

    /// An image object that belongs to this document but no page yet.
    pub fn new_image(&self) -> Result<ImageObject<'_>, Error> {
        let raw = unsafe { ffi::FPDFPageObj_NewImageObj(self.raw) };
        if raw.is_null() {
            return Err(Error::CreateImage);
        }
        Ok(ImageObject {
            raw,
            _document: PhantomData,
        })
    }
}

/// An open page; closed on drop.
pub struct Page<'doc> {
    raw: ffi::FPDF_PAGE,
    _document: PhantomData<&'doc Document>,
}

impl<'doc> Page<'doc> {
    fn from_raw(raw: ffi::FPDF_PAGE) -> Option<Self> {
        (!raw.is_null()).then_some(Self {
            raw,
            _document: PhantomData,
        })
    }

    /// In points, with the page's /Rotate applied.
    pub fn width(&self) -> f32 {
        unsafe { ffi::FPDF_GetPageWidthF(self.raw) }
    }

    /// In points, with the page's /Rotate applied.
    pub fn height(&self) -> f32 {
        unsafe { ffi::FPDF_GetPageHeightF(self.raw) }
    }

    /// Draws the page, annotations included, scaled to fill `bitmap`.
    pub fn render(&self, bitmap: &mut Bitmap) {
        unsafe {
            ffi::FPDF_RenderPageBitmap(
                bitmap.raw,
                self.raw,
                0,
                0,
                bitmap.width,
                bitmap.height,
                0,
                ffi::FPDF_ANNOT,
            )
        }
    }

    /// Adds `image` on top of the page's content; the page owns it from here.
    pub fn insert(&mut self, image: ImageObject<'doc>) {
        let image = ManuallyDrop::new(image);
        unsafe { ffi::FPDFPage_InsertObject(self.raw, image.raw) }
    }

    /// Writes the page's objects to its content stream. Needed before the host
    /// saves, or objects inserted since loading are lost.
    pub fn generate_content(&mut self) -> Result<(), Error> {
        let ok = unsafe { ffi::FPDFPage_GenerateContent(self.raw) };
        if ok == 0 {
            return Err(Error::GenerateContent);
        }
        Ok(())
    }
}

impl Drop for Page<'_> {
    fn drop(&mut self) {
        unsafe { ffi::FPDF_ClosePage(self.raw) }
    }
}

/// An image object not yet on a page; destroyed on drop unless
/// [`Page::insert`] takes it.
pub struct ImageObject<'doc> {
    raw: ffi::FPDF_PAGEOBJECT,
    _document: PhantomData<&'doc Document>,
}

impl ImageObject<'_> {
    /// Copies `bitmap`'s pixels into the image.
    pub fn set_bitmap(&mut self, bitmap: &Bitmap) -> Result<(), Error> {
        let ok = unsafe { ffi::FPDFImageObj_SetBitmap(ptr::null_mut(), 0, self.raw, bitmap.raw) };
        if ok == 0 {
            return Err(Error::SetBitmap);
        }
        Ok(())
    }

    /// Applies the affine matrix `[a b c d e f]`. A fresh image is a 1x1 unit
    /// square at the origin, so `(w, 0, 0, h, x, y)` places it as a `w` by `h`
    /// rectangle at `(x, y)`.
    pub fn transform(&mut self, a: f64, b: f64, c: f64, d: f64, e: f64, f: f64) {
        unsafe { ffi::FPDFPageObj_Transform(self.raw, a, b, c, d, e, f) }
    }
}

impl Drop for ImageObject<'_> {
    fn drop(&mut self) {
        unsafe { ffi::FPDFPageObj_Destroy(self.raw) }
    }
}

/// An opaque bitmap in PDFium's memory, 4 bytes per pixel in B, G, R, unused
/// order; destroyed on drop.
pub struct Bitmap {
    raw: ffi::FPDF_BITMAP,
    width: c_int,
    height: c_int,
}

impl Bitmap {
    pub fn new_bgrx(width: usize, height: usize) -> Result<Self, Error> {
        let width = c_int::try_from(width).map_err(|_| Error::CreateBitmap)?;
        let height = c_int::try_from(height).map_err(|_| Error::CreateBitmap)?;
        let raw = unsafe { ffi::FPDFBitmap_Create(width, height, 0) };
        if raw.is_null() {
            return Err(Error::CreateBitmap);
        }
        Ok(Self { raw, width, height })
    }

    /// Fills the whole bitmap with an `0xAARRGGBB` colour.
    pub fn fill(&mut self, argb: u32) {
        unsafe {
            ffi::FPDFBitmap_FillRect(
                self.raw,
                0,
                0,
                self.width,
                self.height,
                ffi::FPDF_DWORD::from(argb),
            );
        }
    }

    /// The pixels, rows packed with no stride padding.
    pub fn read_pixels(&self) -> Result<Vec<u8>, Error> {
        let layout = self.layout()?;
        let mut pixels = vec![0; layout.packed_len];
        for (row, chunk) in pixels.chunks_exact_mut(layout.row_len).enumerate() {
            unsafe { host::copy_from_pdfium(layout.base.wrapping_add(row * layout.stride), chunk) }
        }
        Ok(pixels)
    }

    /// Replaces the pixels with `pixels`, laid out as [`Bitmap::read_pixels`]
    /// returns them.
    pub fn write_pixels(&mut self, pixels: &[u8]) -> Result<(), Error> {
        let layout = self.layout()?;
        if pixels.len() != layout.packed_len {
            return Err(Error::PixelBufferSize);
        }
        for (row, chunk) in pixels.chunks_exact(layout.row_len).enumerate() {
            unsafe { host::copy_to_pdfium(chunk, layout.base.wrapping_add(row * layout.stride)) }
        }
        Ok(())
    }

    fn layout(&self) -> Result<BufferLayout, Error> {
        let width = usize::try_from(self.width).map_err(|_| Error::PixelBufferSize)?;
        let height = usize::try_from(self.height).map_err(|_| Error::PixelBufferSize)?;
        let stride = unsafe { ffi::FPDFBitmap_GetStride(self.raw) };
        let stride = usize::try_from(stride).map_err(|_| Error::PixelBufferSize)?;
        let row_len = width.checked_mul(4).ok_or(Error::PixelBufferSize)?;
        let packed_len = row_len.checked_mul(height).ok_or(Error::PixelBufferSize)?;
        if stride < row_len {
            return Err(Error::PixelBufferSize);
        }
        let base = unsafe { ffi::FPDFBitmap_GetBuffer(self.raw) }.cast::<u8>();
        if base.is_null() {
            return Err(Error::PixelBufferSize);
        }
        Ok(BufferLayout {
            base,
            stride,
            row_len,
            packed_len,
        })
    }
}

impl Drop for Bitmap {
    fn drop(&mut self) {
        unsafe { ffi::FPDFBitmap_Destroy(self.raw) }
    }
}

/// Where a bitmap's rows sit in PDFium's memory. `base` is a PDFium address:
/// in wasm it points into no allocation of ours, so it is only offset with
/// wrapping arithmetic and handed to `host::copy_*`, never dereferenced.
struct BufferLayout {
    base: *mut u8,
    stride: usize,
    row_len: usize,
    packed_len: usize,
}
