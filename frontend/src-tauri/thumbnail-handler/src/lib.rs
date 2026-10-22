//! Stirling-PDF Windows Thumbnail Handler
//!
//! A lightweight COM DLL that implements IThumbnailProvider for PDF files.
//! Uses the built-in Windows.Data.Pdf WinRT API to render page 1 as a thumbnail.

use std::cell::RefCell;
use std::ffi::c_void;
use std::panic::catch_unwind;
use std::sync::atomic::{AtomicU32, Ordering};

use windows::core::{implement, IUnknown, Interface, GUID, HRESULT};
use windows::Win32::Foundation::{
    BOOL, CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_FAIL, E_UNEXPECTED, S_FALSE, S_OK,
};
use windows::Win32::Graphics::Gdi::{
    CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_WICPixelFormat32bppBGRA, IWICImagingFactory,
    WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
};
use windows::Win32::System::Com::{
    CoCreateInstance, IClassFactory, IClassFactory_Impl, IStream, CLSCTX_INPROC_SERVER,
    STATFLAG_DEFAULT, STREAM_SEEK_SET,
};
use windows::Win32::UI::Shell::{
    IThumbnailProvider, IThumbnailProvider_Impl, SHCreateMemStream, WTS_ALPHATYPE,
};
use windows::Win32::UI::Shell::PropertiesSystem::{
    IInitializeWithStream, IInitializeWithStream_Impl,
};

// WinRT imports for PDF rendering
use windows::Data::Pdf::PdfDocument;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream, IRandomAccessStream};

// CLSID for this thumbnail handler -- must match WiX registry entries
const CLSID_STIRLING_THUMBNAIL: GUID = GUID::from_u128(0x2d2fbe3a_9a88_4308_a52e_7ef63ca7cf48);

static DLL_REF_COUNT: AtomicU32 = AtomicU32::new(0);

// Maximum PDF size we'll attempt to thumbnail (256 MB)
const MAX_PDF_SIZE: usize = 256 * 1024 * 1024;

// ---------------------------------------------------------------------------
// ThumbnailProvider -- the COM object
// ---------------------------------------------------------------------------

#[implement(IThumbnailProvider, IInitializeWithStream)]
struct ThumbnailProvider {
    stream: RefCell<Option<IStream>>,
}

impl ThumbnailProvider {
    fn new() -> Self {
        DLL_REF_COUNT.fetch_add(1, Ordering::SeqCst);
        Self {
            stream: RefCell::new(None),
        }
    }
}

impl Drop for ThumbnailProvider {
    fn drop(&mut self) {
        DLL_REF_COUNT.fetch_sub(1, Ordering::SeqCst);
    }
}

impl IInitializeWithStream_Impl for ThumbnailProvider_Impl {
    fn Initialize(
        &self,
        pstream: Option<&IStream>,
        _grfmode: u32,
    ) -> windows::core::Result<()> {
        let result = catch_unwind(std::panic::AssertUnwindSafe(|| {
            *self.stream.borrow_mut() = pstream.cloned();
        }));
        match result {
            Ok(()) => Ok(()),
            Err(_) => Err(E_UNEXPECTED.into()),
        }
    }
}

impl IThumbnailProvider_Impl for ThumbnailProvider_Impl {
    fn GetThumbnail(
        &self,
        cx: u32,
        phbmp: *mut HBITMAP,
        pdwalpha: *mut WTS_ALPHATYPE,
    ) -> windows::core::Result<()> {
        let result = catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.get_thumbnail_inner(cx, phbmp, pdwalpha)
        }));

        match result {
            Ok(inner) => inner,
            Err(_) => Err(E_UNEXPECTED.into()),
        }
    }
}

impl ThumbnailProvider_Impl {
    fn get_thumbnail_inner(
        &self,
        cx: u32,
        phbmp: *mut HBITMAP,
        pdwalpha: *mut WTS_ALPHATYPE,
    ) -> windows::core::Result<()> {
        let stream = self.stream.borrow();
        let stream = stream.as_ref().ok_or(E_FAIL)?;

        // Step 1: Read the IStream into a byte buffer
        let bytes = read_istream_to_vec(stream)?;
        if bytes.is_empty() {
            return Err(E_FAIL.into());
        }

        // Step 2: Load the PDF via WinRT
        let winrt_stream = bytes_to_random_access_stream(&bytes)?;
        let pdf_doc = PdfDocument::LoadFromStreamAsync(&winrt_stream)?.get()?;

        if pdf_doc.PageCount()? == 0 {
            return Err(E_FAIL.into());
        }

        let page = pdf_doc.GetPage(0)?;

        // Step 3: Render page 1 to a PNG stream
        let output_stream = InMemoryRandomAccessStream::new()?;
        let render_options = windows::Data::Pdf::PdfPageRenderOptions::new()?;

        // Calculate dimensions preserving aspect ratio
        let page_size = page.Size()?;
        let scale = cx as f64 / f64::max(page_size.Width as f64, page_size.Height as f64);
        let render_w = (page_size.Width as f64 * scale).max(1.0) as u32;
        let render_h = (page_size.Height as f64 * scale).max(1.0) as u32;

        render_options.SetDestinationWidth(render_w)?;
        render_options.SetDestinationHeight(render_h)?;

        page.RenderWithOptionsToStreamAsync(&output_stream, &render_options)?
            .get()?;

        // Step 4: Decode the PNG using WIC -> raw BGRA pixels -> HBITMAP
        let hbitmap = png_stream_to_hbitmap(&output_stream, render_w, render_h)?;

        // Step 5: Return the HBITMAP
        unsafe {
            *phbmp = hbitmap;
            // WTSAT_ARGB = 2
            *pdwalpha = WTS_ALPHATYPE(2);
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helper: read IStream to Vec<u8> (with loop for short reads)
// ---------------------------------------------------------------------------

fn read_istream_to_vec(stream: &IStream) -> windows::core::Result<Vec<u8>> {
    unsafe {
        // Get stream size
        let mut stat = std::mem::zeroed();
        stream.Stat(&mut stat, STATFLAG_DEFAULT)?;
        let size = stat.cbSize as usize;

        if size == 0 {
            return Ok(Vec::new());
        }
        if size > MAX_PDF_SIZE {
            return Err(E_FAIL.into());
        }

        // Seek to beginning
        stream.Seek(0, STREAM_SEEK_SET, None)?;

        // Read all bytes, looping for short reads
        let mut buffer = vec![0u8; size];
        let mut total_read = 0usize;
        while total_read < size {
            let mut bytes_read = 0u32;
            stream
                .Read(
                    buffer[total_read..].as_mut_ptr() as *mut c_void,
                    (size - total_read) as u32,
                    Some(&mut bytes_read),
                )
                .ok()?;
            if bytes_read == 0 {
                break;
            }
            total_read += bytes_read as usize;
        }
        buffer.truncate(total_read);

        Ok(buffer)
    }
}

// ---------------------------------------------------------------------------
// Helper: bytes -> WinRT IRandomAccessStream
// ---------------------------------------------------------------------------

fn bytes_to_random_access_stream(bytes: &[u8]) -> windows::core::Result<IRandomAccessStream> {
    let mem_stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&mem_stream)?;
    writer.WriteBytes(bytes)?;
    writer.StoreAsync()?.get()?;
    // Detach the writer so it doesn't close the stream
    writer.DetachStream()?;

    // Seek back to beginning
    mem_stream.Seek(0)?;

    Ok(mem_stream.cast()?)
}

// ---------------------------------------------------------------------------
// Helper: PNG stream -> HBITMAP via WIC (with format conversion to BGRA32)
// ---------------------------------------------------------------------------

fn png_stream_to_hbitmap(
    winrt_stream: &InMemoryRandomAccessStream,
    width: u32,
    height: u32,
) -> windows::core::Result<HBITMAP> {
    unsafe {
        // Seek to beginning and read PNG data
        winrt_stream.Seek(0)?;

        let size = winrt_stream.Size()? as usize;
        if size == 0 {
            return Err(E_FAIL.into());
        }

        let reader = windows::Storage::Streams::DataReader::CreateDataReader(
            &winrt_stream.GetInputStreamAt(0)?,
        )?;
        reader.LoadAsync(size as u32)?.get()?;
        let mut png_bytes = vec![0u8; size];
        reader.ReadBytes(&mut png_bytes)?;

        // Create a COM IStream from the PNG bytes
        let png_stream = SHCreateMemStream(Some(&png_bytes)).ok_or(E_FAIL)?;

        // Create WIC factory and decode the PNG
        let wic_factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;

        let decoder = wic_factory.CreateDecoderFromStream(
            &png_stream,
            std::ptr::null(),
            WICDecodeMetadataCacheOnDemand,
        )?;

        let frame = decoder.GetFrame(0)?;

        // Convert to BGRA32 to ensure consistent pixel format
        let converter = wic_factory.CreateFormatConverter()?;
        converter.Initialize(
            &frame,
            &GUID_WICPixelFormat32bppBGRA,
            WICBitmapDitherTypeNone,
            None,
            0.0,
            WICBitmapPaletteTypeCustom,
        )?;

        // Read pixels as BGRA
        let stride = width * 4;
        let buf_size = (stride * height) as usize;
        let mut pixels = vec![0u8; buf_size];
        converter.CopyPixels(std::ptr::null(), stride, &mut pixels)?;

        // Create a DIB section HBITMAP
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [std::mem::zeroed()],
        };

        let mut bits: *mut c_void = std::ptr::null_mut();
        let hbitmap = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)?;

        if bits.is_null() {
            return Err(E_FAIL.into());
        }

        // Copy pixel data into the DIB section
        std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u8, buf_size);

        Ok(hbitmap)
    }
}

// ---------------------------------------------------------------------------
// ClassFactory
// ---------------------------------------------------------------------------

#[implement(IClassFactory)]
struct ThumbnailProviderFactory;

impl IClassFactory_Impl for ThumbnailProviderFactory_Impl {
    fn CreateInstance(
        &self,
        punkouter: Option<&IUnknown>,
        riid: *const GUID,
        ppvobject: *mut *mut c_void,
    ) -> windows::core::Result<()> {
        unsafe {
            *ppvobject = std::ptr::null_mut();
        }

        if punkouter.is_some() {
            return Err(CLASS_E_NOAGGREGATION.into());
        }

        let provider = ThumbnailProvider::new();
        let unknown: IUnknown = provider.into();

        unsafe { unknown.query(&*riid, ppvobject).ok() }
    }

    fn LockServer(&self, flock: BOOL) -> windows::core::Result<()> {
        if flock.as_bool() {
            DLL_REF_COUNT.fetch_add(1, Ordering::SeqCst);
        } else {
            DLL_REF_COUNT.fetch_sub(1, Ordering::SeqCst);
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DLL exports
// ---------------------------------------------------------------------------

#[no_mangle]
unsafe extern "system" fn DllGetClassObject(
    rclsid: *const GUID,
    riid: *const GUID,
    ppv: *mut *mut c_void,
) -> HRESULT {
    if ppv.is_null() {
        return E_FAIL;
    }
    *ppv = std::ptr::null_mut();

    if *rclsid != CLSID_STIRLING_THUMBNAIL {
        return CLASS_E_CLASSNOTAVAILABLE;
    }

    let factory = ThumbnailProviderFactory;
    let unknown: IUnknown = factory.into();

    match unknown.query(&*riid, ppv).ok() {
        Ok(()) => S_OK,
        Err(e) => e.into(),
    }
}

#[no_mangle]
extern "system" fn DllCanUnloadNow() -> HRESULT {
    if DLL_REF_COUNT.load(Ordering::SeqCst) == 0 {
        S_OK
    } else {
        S_FALSE
    }
}
