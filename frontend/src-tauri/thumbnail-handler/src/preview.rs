//! Explorer preview pane handler (IPreviewHandler) for PDF files.
//!
//! Renders every page with Windows.Data.Pdf into a scrollable child window of
//! the pane. Pages are rendered lazily as they scroll into view. Right-click
//! rotates pages for viewing only; the file is never modified.

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::Ordering;

use windows::core::{implement, w, IUnknown, Interface, GUID, PCWSTR};
use windows::Data::Pdf::PdfDocument;
use windows::Win32::Foundation::{
    BOOL, COLORREF, E_FAIL, E_NOTIMPL, E_UNEXPECTED, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT,
    S_FALSE, S_OK, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateSolidBrush, DeleteDC,
    DeleteObject, EndPaint, FillRect, FrameRect, InvalidateRect, ScreenToClient, SelectObject,
    SetStretchBltMode, StretchBlt, HALFTONE, HBITMAP, HGDIOBJ, PAINTSTRUCT, SRCCOPY,
};
use windows::Win32::System::Com::IStream;
use windows::Win32::System::LibraryLoader::{
    GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
    GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
};
use windows::Win32::System::Ole::{
    IObjectWithSite, IObjectWithSite_Impl, IOleWindow, IOleWindow_Impl,
};
use windows::Win32::UI::Controls::SetScrollInfo;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetFocus, SetFocus, VK_DOWN, VK_END, VK_HOME, VK_NEXT, VK_PRIOR, VK_UP,
};
use windows::Win32::UI::Shell::PropertiesSystem::{
    IInitializeWithStream, IInitializeWithStream_Impl,
};
use windows::Win32::UI::Shell::{IPreviewHandler, IPreviewHandlerFrame, IPreviewHandler_Impl};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    GetClientRect, GetScrollInfo, GetWindowLongPtrW, KillTimer, LoadCursorW, MoveWindow,
    RegisterClassW, SetParent, SetTimer, SetWindowLongPtrW, TrackPopupMenu, UnregisterClassW,
    CS_HREDRAW, CS_VREDRAW, GWLP_USERDATA, IDC_ARROW, MF_GRAYED, MF_SEPARATOR, MF_STRING, MSG,
    SB_BOTTOM, SB_LINEDOWN, SB_LINEUP, SB_PAGEDOWN, SB_PAGEUP, SB_THUMBPOSITION, SB_THUMBTRACK,
    SB_TOP, SB_VERT, SCROLLINFO, SIF_ALL, SIF_DISABLENOSCROLL, SIF_PAGE, SIF_POS, SIF_RANGE,
    SIF_TRACKPOS, TPM_RETURNCMD, TPM_RIGHTBUTTON, WINDOW_EX_STYLE, WM_CONTEXTMENU, WM_ERASEBKGND,
    WM_KEYDOWN, WM_LBUTTONDOWN, WM_MOUSEWHEEL, WM_NCDESTROY, WM_PAINT, WM_SIZE, WM_TIMER,
    WM_VSCROLL, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_VISIBLE, WS_VSCROLL,
};

use crate::render_worker::{RenderKey, RenderWorker, WM_RENDERED};
use crate::{bytes_to_random_access_stream, read_istream_to_vec, DLL_REF_COUNT};

// CLSID for the preview handler -- must match WiX registry entries
pub(crate) const CLSID_STIRLING_PREVIEW: GUID =
    GUID::from_u128(0x4175c0bd_22bb_466c_a099_721c6e8b8040);

const CLASS_NAME: PCWSTR = w!("StirlingPdfPreviewWindow");
const MARGIN: i32 = 12;
const GAP: i32 = 12;
const LINE_STEP: i32 = 48;
const RESIZE_TIMER: usize = 1;
// Longest rendered page edge in pixels; bounds memory for extreme page shapes
const MAX_PAGE_PX: f64 = 4096.0;
const BACKGROUND: COLORREF = COLORREF(0x00E6E6E6);
const BORDER: COLORREF = COLORREF(0x00B4B4B4);
const PAGE_FILL: COLORREF = COLORREF(0x00FFFFFF);

// Context menu commands: (id, label, applies to clicked page only, quarter turns)
const ROTATE_COMMANDS: [(usize, PCWSTR, bool, u8); 4] = [
    (1, w!("Rotate page clockwise"), true, 1),
    (2, w!("Rotate page counterclockwise"), true, 3),
    (3, w!("Rotate all pages clockwise"), false, 1),
    (4, w!("Rotate all pages counterclockwise"), false, 3),
];

// ---------------------------------------------------------------------------
// PreviewHandler -- the COM object
// ---------------------------------------------------------------------------

#[implement(IPreviewHandler, IInitializeWithStream, IObjectWithSite, IOleWindow)]
pub(crate) struct PreviewHandler {
    stream: RefCell<Option<IStream>>,
    site: RefCell<Option<IUnknown>>,
    parent: Cell<HWND>,
    rect: Cell<RECT>,
    hwnd: Cell<HWND>,
}

impl PreviewHandler {
    pub(crate) fn new() -> Self {
        DLL_REF_COUNT.fetch_add(1, Ordering::SeqCst);
        Self {
            stream: RefCell::new(None),
            site: RefCell::new(None),
            parent: Cell::new(HWND::default()),
            rect: Cell::new(RECT::default()),
            hwnd: Cell::new(HWND::default()),
        }
    }

    fn destroy_window(&self) {
        let hwnd = self.hwnd.replace(HWND::default());
        if !hwnd.is_invalid() {
            unsafe {
                let _ = DestroyWindow(hwnd);
                let _ = UnregisterClassW(CLASS_NAME, module_instance());
            }
        }
    }

    fn do_preview_inner(&self) -> windows::core::Result<()> {
        self.destroy_window();
        let bytes = {
            let stream = self.stream.borrow();
            read_istream_to_vec(stream.as_ref().ok_or(E_FAIL)?)?
        };
        if bytes.is_empty() {
            return Err(E_FAIL.into());
        }
        let doc =
            PdfDocument::LoadFromStreamAsync(&bytes_to_random_access_stream(&bytes)?)?.get()?;
        let sizes = (0..doc.PageCount()?)
            .map(|i| {
                let size = doc.GetPage(i)?.Size()?;
                Ok((size.Width.max(1.0) as f64, size.Height.max(1.0) as f64))
            })
            .collect::<windows::core::Result<Vec<_>>>()?;
        if sizes.is_empty() {
            return Err(E_FAIL.into());
        }

        let view = Box::new(View {
            doc,
            turns: vec![0; sizes.len()],
            sizes,
            scroll: 0,
            resizing: false,
            cache: HashMap::new(),
            worker: None,
        });
        let hwnd = create_view_window(self.parent.get(), self.rect.get(), view)?;
        self.hwnd.set(hwnd);
        Ok(())
    }
}

impl Drop for PreviewHandler {
    fn drop(&mut self) {
        self.destroy_window();
        DLL_REF_COUNT.fetch_sub(1, Ordering::SeqCst);
    }
}

fn guarded<T>(f: impl FnOnce() -> windows::core::Result<T>) -> windows::core::Result<T> {
    catch_unwind(AssertUnwindSafe(f)).unwrap_or_else(|_| Err(E_UNEXPECTED.into()))
}

impl IInitializeWithStream_Impl for PreviewHandler_Impl {
    fn Initialize(&self, pstream: Option<&IStream>, _grfmode: u32) -> windows::core::Result<()> {
        guarded(|| {
            *self.stream.borrow_mut() = pstream.cloned();
            Ok(())
        })
    }
}

impl IPreviewHandler_Impl for PreviewHandler_Impl {
    fn SetWindow(&self, hwnd: HWND, prc: *const RECT) -> windows::core::Result<()> {
        guarded(|| {
            self.parent.set(hwnd);
            if let Some(rect) = unsafe { prc.as_ref() } {
                self.rect.set(*rect);
            }
            let child = self.hwnd.get();
            if !child.is_invalid() {
                unsafe {
                    SetParent(child, hwnd)?;
                    move_to(child, self.rect.get());
                }
            }
            Ok(())
        })
    }

    fn SetRect(&self, prc: *const RECT) -> windows::core::Result<()> {
        guarded(|| {
            let rect = unsafe { prc.as_ref() }.ok_or(E_FAIL)?;
            self.rect.set(*rect);
            let child = self.hwnd.get();
            if !child.is_invalid() {
                unsafe { move_to(child, *rect) };
            }
            Ok(())
        })
    }

    fn DoPreview(&self) -> windows::core::Result<()> {
        guarded(|| self.do_preview_inner())
    }

    fn Unload(&self) -> windows::core::Result<()> {
        guarded(|| {
            self.destroy_window();
            *self.stream.borrow_mut() = None;
            Ok(())
        })
    }

    fn SetFocus(&self) -> windows::core::Result<()> {
        guarded(|| {
            let child = self.hwnd.get();
            if !child.is_invalid() {
                unsafe {
                    let _ = SetFocus(child);
                }
            }
            Ok(())
        })
    }

    fn QueryFocus(&self) -> windows::core::Result<HWND> {
        guarded(|| {
            let focus = unsafe { GetFocus() };
            if focus.is_invalid() {
                Err(E_FAIL.into())
            } else {
                Ok(focus)
            }
        })
    }

    fn TranslateAccelerator(&self, pmsg: *const MSG) -> windows::core::Result<()> {
        guarded(|| {
            // Let the host frame handle its own shortcuts (Tab, F5, etc.)
            let frame = self
                .site
                .borrow()
                .as_ref()
                .and_then(|site| site.cast::<IPreviewHandlerFrame>().ok());
            let hr = match frame {
                Some(frame) => unsafe {
                    (Interface::vtable(&frame).TranslateAccelerator)(frame.as_raw(), pmsg)
                },
                None => S_FALSE,
            };
            if hr == S_OK {
                Ok(())
            } else {
                Err(hr.into())
            }
        })
    }
}

impl IObjectWithSite_Impl for PreviewHandler_Impl {
    fn SetSite(&self, punksite: Option<&IUnknown>) -> windows::core::Result<()> {
        guarded(|| {
            *self.site.borrow_mut() = punksite.cloned();
            Ok(())
        })
    }

    fn GetSite(&self, riid: *const GUID, ppvsite: *mut *mut c_void) -> windows::core::Result<()> {
        guarded(|| unsafe {
            *ppvsite = std::ptr::null_mut();
            match self.site.borrow().as_ref() {
                Some(site) => site.query(&*riid, ppvsite).ok(),
                None => Err(E_FAIL.into()),
            }
        })
    }
}

impl IOleWindow_Impl for PreviewHandler_Impl {
    fn GetWindow(&self) -> windows::core::Result<HWND> {
        let hwnd = self.hwnd.get();
        if hwnd.is_invalid() {
            Err(E_FAIL.into())
        } else {
            Ok(hwnd)
        }
    }

    fn ContextSensitiveHelp(&self, _fentermode: BOOL) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
}

// ---------------------------------------------------------------------------
// View window -- owns the document and the rendered page cache
// ---------------------------------------------------------------------------

struct View {
    doc: PdfDocument,
    sizes: Vec<(f64, f64)>,
    // View-only clockwise quarter turns per page
    turns: Vec<u8>,
    scroll: i32,
    // True while the pane is being resized: stretch old bitmaps instead of re-rendering
    resizing: bool,
    // page index -> (rendered width, rendered height, turns, bitmap)
    cache: HashMap<u32, (i32, i32, u8, HBITMAP)>,
    // Renders pages off the window thread; started once the window exists
    worker: Option<RenderWorker>,
}

struct PageSlot {
    index: u32,
    rect: RECT,
}

impl View {
    fn page_width(client_w: i32) -> i32 {
        (client_w - 2 * MARGIN).max(16)
    }

    fn layout(&self, client_w: i32) -> (Vec<PageSlot>, i32) {
        let width = Self::page_width(client_w);
        let mut top = MARGIN;
        let slots = self
            .sizes
            .iter()
            .zip(&self.turns)
            .enumerate()
            .map(|(i, (&(w, h), &turns))| {
                let (w, h) = if turns % 2 == 1 { (h, w) } else { (w, h) };
                let scale = (width as f64 / w).min(MAX_PAGE_PX / w.max(h));
                let page_w = (w * scale).round().max(1.0) as i32;
                let height = (h * scale).round().max(1.0) as i32;
                let left = MARGIN + (width - page_w) / 2;
                let slot = PageSlot {
                    index: i as u32,
                    rect: RECT {
                        left,
                        top,
                        right: left + page_w,
                        bottom: top.saturating_add(height),
                    },
                };
                top = top.saturating_add(height + GAP);
                slot
            })
            .collect();
        (slots, top - GAP + MARGIN)
    }

    fn key_for(&self, index: u32, width: i32, height: i32) -> RenderKey {
        RenderKey {
            index,
            width,
            height,
            turns: self.turns[index as usize],
        }
    }

    // Best bitmap available now and its pixel size, which may differ from the slot
    // (stretched) while a fresh render is pending. None shows a blank page.
    fn bitmap_for(&mut self, key: RenderKey) -> Option<(HBITMAP, i32, i32)> {
        let cached = self.cache.get(&key.index).copied();
        let exact =
            cached.is_some_and(|(w, h, t, _)| (w, h, t) == (key.width, key.height, key.turns));
        if !exact && !self.resizing {
            if let Some(worker) = &mut self.worker {
                worker.request(key);
            }
        }
        cached
            .filter(|&(_, _, turns, _)| turns == key.turns)
            .map(|(w, h, _, bmp)| (bmp, w, h))
    }

    // Collect finished renders; only keep ones still matching the page's rotation
    fn collect_rendered(&mut self) {
        let Some(worker) = &mut self.worker else {
            return;
        };
        for (key, bmp) in worker.take_done() {
            let current = self.turns.get(key.index as usize) == Some(&key.turns);
            let old = if current {
                self.cache
                    .insert(key.index, (key.width, key.height, key.turns, bmp))
            } else {
                Some((0, 0, 0, bmp))
            };
            if let Some((_, _, _, old)) = old {
                unsafe {
                    let _ = DeleteObject(old);
                }
            }
        }
    }

    fn page_at(&self, client_w: i32, client_y: i32) -> Option<u32> {
        let y = client_y + self.scroll;
        let (slots, _) = self.layout(client_w);
        slots
            .iter()
            .find(|s| y >= s.rect.top - GAP / 2 && y < s.rect.bottom + GAP / 2)
            .map(|s| s.index)
    }

    fn rotate(&mut self, page: Option<u32>, quarter_turns: u8) {
        for (i, turns) in self.turns.iter_mut().enumerate() {
            if page.is_none_or(|p| p as usize == i) {
                *turns = (*turns + quarter_turns) % 4;
            }
        }
    }

    // Drop bitmaps for pages that are far from the viewport to bound memory
    fn evict_outside(&mut self, first: u32, last: u32) {
        let keep = first.saturating_sub(2)..=last.saturating_add(2);
        self.cache.retain(|index, (_, _, _, bmp)| {
            let retain = keep.contains(index);
            if !retain {
                unsafe {
                    let _ = DeleteObject(*bmp);
                }
            }
            retain
        });
    }
}

impl Drop for View {
    fn drop(&mut self) {
        for (_, _, _, bmp) in self.cache.values() {
            unsafe {
                let _ = DeleteObject(*bmp);
            }
        }
    }
}

fn module_instance() -> HINSTANCE {
    let mut module = Default::default();
    unsafe {
        let _ = GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            PCWSTR(module_instance as *const u16),
            &mut module,
        );
    }
    module.into()
}

unsafe fn move_to(hwnd: HWND, rect: RECT) {
    let _ = MoveWindow(
        hwnd,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
        true,
    );
}

fn create_view_window(parent: HWND, rect: RECT, view: Box<View>) -> windows::core::Result<HWND> {
    unsafe {
        let instance = module_instance();
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: instance,
            hCursor: LoadCursorW(None, IDC_ARROW)?,
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        // Fails harmlessly if a previous preview left the class registered
        RegisterClassW(&class);

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            CLASS_NAME,
            w!(""),
            WS_CHILD | WS_VISIBLE | WS_VSCROLL | WS_CLIPCHILDREN,
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
            parent,
            None,
            instance,
            None,
        )
        .inspect_err(|_| {
            let _ = UnregisterClassW(CLASS_NAME, instance);
        })?;
        let mut view = view;
        view.worker = Some(RenderWorker::spawn(view.doc.clone(), hwnd));
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(view) as isize);
        update_scrollbar(hwnd);
        let _ = InvalidateRect(hwnd, None, true);
        Ok(hwnd)
    }
}

unsafe fn view_of<'a>(hwnd: HWND) -> Option<&'a mut View> {
    (GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut View).as_mut()
}

unsafe fn client_size(hwnd: HWND) -> (i32, i32) {
    let mut rc = RECT::default();
    let _ = GetClientRect(hwnd, &mut rc);
    (rc.right - rc.left, rc.bottom - rc.top)
}

unsafe fn update_scrollbar(hwnd: HWND) {
    let Some(view) = view_of(hwnd) else { return };
    let (w, h) = client_size(hwnd);
    let (_, total) = view.layout(w);
    view.scroll = view.scroll.clamp(0, (total - h).max(0));
    let info = SCROLLINFO {
        cbSize: std::mem::size_of::<SCROLLINFO>() as u32,
        // Keep the bar present so showing/hiding it can't re-enter WM_SIZE
        fMask: SIF_RANGE | SIF_PAGE | SIF_POS | SIF_DISABLENOSCROLL,
        nMin: 0,
        nMax: total - 1,
        nPage: h.max(0) as u32,
        nPos: view.scroll,
        nTrackPos: 0,
    };
    SetScrollInfo(hwnd, SB_VERT, &info, true);
}

unsafe fn scroll_to(hwnd: HWND, target: i32) {
    if let Some(view) = view_of(hwnd) {
        view.scroll = target;
        update_scrollbar(hwnd);
        let _ = InvalidateRect(hwnd, None, false);
    }
}

unsafe fn scroll_by(hwnd: HWND, delta: i32) {
    if let Some(view) = view_of(hwnd) {
        scroll_to(hwnd, view.scroll + delta);
    }
}

unsafe fn paint(hwnd: HWND) {
    let mut ps = PAINTSTRUCT::default();
    let hdc = BeginPaint(hwnd, &mut ps);
    let (w, h) = client_size(hwnd);
    if let Some(view) = view_of(hwnd).filter(|_| w > 0 && h > 0) {
        // Double-buffer so scrolling doesn't flicker
        let mem = CreateCompatibleDC(hdc);
        let back = CreateCompatibleBitmap(hdc, w, h);
        let old_back = SelectObject(mem, back);
        let bg = CreateSolidBrush(BACKGROUND);
        let border = CreateSolidBrush(BORDER);
        let page_fill = CreateSolidBrush(PAGE_FILL);
        FillRect(
            mem,
            &RECT {
                left: 0,
                top: 0,
                right: w,
                bottom: h,
            },
            bg,
        );

        let (slots, _) = view.layout(w);
        let visible: Vec<&PageSlot> = slots
            .iter()
            .filter(|s| s.rect.bottom - view.scroll > 0 && s.rect.top - view.scroll < h)
            .collect();
        let keys: Vec<RenderKey> = visible
            .iter()
            .map(|s| {
                let (pw, ph) = (s.rect.right - s.rect.left, s.rect.bottom - s.rect.top);
                view.key_for(s.index, pw, ph)
            })
            .collect();
        if !view.resizing {
            if let Some(worker) = &mut view.worker {
                worker.set_wanted(keys.iter().copied().collect::<HashSet<_>>());
            }
        }
        let page_dc = CreateCompatibleDC(hdc);
        for (slot, key) in visible.iter().zip(&keys) {
            let r = RECT {
                left: slot.rect.left,
                top: slot.rect.top - view.scroll,
                right: slot.rect.right,
                bottom: slot.rect.bottom - view.scroll,
            };
            let (pw, ph) = (r.right - r.left, r.bottom - r.top);
            match view.bitmap_for(*key) {
                Some((bmp, bw, bh)) => {
                    let old = SelectObject(page_dc, bmp);
                    if (bw, bh) == (pw, ph) {
                        let _ = BitBlt(mem, r.left, r.top, pw, ph, page_dc, 0, 0, SRCCOPY);
                    } else {
                        SetStretchBltMode(mem, HALFTONE);
                        let _ =
                            StretchBlt(mem, r.left, r.top, pw, ph, page_dc, 0, 0, bw, bh, SRCCOPY);
                    }
                    SelectObject(page_dc, old);
                }
                None => {
                    FillRect(mem, &r, page_fill);
                }
            }
            let frame = RECT {
                left: r.left - 1,
                top: r.top - 1,
                right: r.right + 1,
                bottom: r.bottom + 1,
            };
            FrameRect(mem, &frame, border);
        }
        if let (Some(first), Some(last)) = (visible.first(), visible.last()) {
            view.evict_outside(first.index, last.index);
        }

        let _ = BitBlt(hdc, 0, 0, w, h, mem, 0, 0, SRCCOPY);
        SelectObject(mem, old_back);
        for obj in [
            HGDIOBJ(back.0),
            HGDIOBJ(bg.0),
            HGDIOBJ(border.0),
            HGDIOBJ(page_fill.0),
        ] {
            let _ = DeleteObject(obj);
        }
        let _ = DeleteDC(page_dc);
        let _ = DeleteDC(mem);
    }
    let _ = EndPaint(hwnd, &ps);
}

unsafe fn show_rotate_menu(hwnd: HWND, lparam: LPARAM) {
    let (w, _) = client_size(hwnd);
    let mut pt = POINT {
        x: (lparam.0 & 0xFFFF) as u16 as i16 as i32,
        y: ((lparam.0 >> 16) & 0xFFFF) as u16 as i16 as i32,
    };
    // Keyboard-invoked menus (Shift+F10) report -1,-1: anchor at the top-left
    let from_keyboard = pt.x == -1 && pt.y == -1;
    let mut client = pt;
    if from_keyboard {
        client = POINT {
            x: MARGIN,
            y: MARGIN,
        };
        pt = client;
        let _ = windows::Win32::Graphics::Gdi::ClientToScreen(hwnd, &mut pt);
    } else {
        let _ = ScreenToClient(hwnd, &mut client);
    }
    let Some(page) = view_of(hwnd).map(|view| view.page_at(w, client.y)) else {
        return;
    };

    let Ok(menu) = CreatePopupMenu() else { return };
    for (i, (id, label, page_only, _)) in ROTATE_COMMANDS.iter().enumerate() {
        if i == 2 {
            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, None);
        }
        let flags = if *page_only && page.is_none() {
            MF_STRING | MF_GRAYED
        } else {
            MF_STRING
        };
        let _ = AppendMenuW(menu, flags, *id, *label);
    }
    let chosen = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_RIGHTBUTTON,
        pt.x,
        pt.y,
        0,
        hwnd,
        None,
    );
    let _ = DestroyMenu(menu);

    let command = ROTATE_COMMANDS
        .iter()
        .find(|(id, ..)| *id as i32 == chosen.0);
    // Re-fetch: the modal menu loop may have let the host unload the preview
    if let (Some((_, _, page_only, quarter_turns)), Some(view)) = (command, view_of(hwnd)) {
        view.rotate(if *page_only { page } else { None }, *quarter_turns);
        update_scrollbar(hwnd);
        let _ = InvalidateRect(hwnd, None, false);
    }
}

unsafe fn handle_message(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    match msg {
        WM_CONTEXTMENU => show_rotate_menu(hwnd, lparam),
        WM_PAINT => paint(hwnd),
        WM_RENDERED => {
            if let Some(view) = view_of(hwnd) {
                view.collect_rendered();
            }
            let _ = InvalidateRect(hwnd, None, false);
        }
        WM_ERASEBKGND => return Some(LRESULT(1)),
        WM_SIZE => {
            if let Some(view) = view_of(hwnd) {
                view.resizing = true;
                SetTimer(hwnd, RESIZE_TIMER, 150, None);
            }
            update_scrollbar(hwnd);
            let _ = InvalidateRect(hwnd, None, false);
        }
        WM_TIMER if wparam.0 == RESIZE_TIMER => {
            let _ = KillTimer(hwnd, RESIZE_TIMER);
            if let Some(view) = view_of(hwnd) {
                view.resizing = false;
            }
            let _ = InvalidateRect(hwnd, None, false);
        }
        WM_MOUSEWHEEL => {
            let delta = ((wparam.0 >> 16) & 0xFFFF) as u16 as i16 as i32;
            scroll_by(hwnd, -delta * LINE_STEP * 3 / 120);
        }
        WM_LBUTTONDOWN => {
            let _ = SetFocus(hwnd);
        }
        WM_KEYDOWN => {
            let (_, h) = client_size(hwnd);
            let key = wparam.0 as u16;
            match key {
                k if k == VK_DOWN.0 => scroll_by(hwnd, LINE_STEP),
                k if k == VK_UP.0 => scroll_by(hwnd, -LINE_STEP),
                k if k == VK_NEXT.0 => scroll_by(hwnd, h),
                k if k == VK_PRIOR.0 => scroll_by(hwnd, -h),
                k if k == VK_HOME.0 => scroll_to(hwnd, 0),
                k if k == VK_END.0 => scroll_to(hwnd, i32::MAX / 2),
                _ => return None,
            }
        }
        WM_VSCROLL => {
            let (_, h) = client_size(hwnd);
            let code = (wparam.0 & 0xFFFF) as i32;
            match code {
                c if c == SB_LINEDOWN.0 => scroll_by(hwnd, LINE_STEP),
                c if c == SB_LINEUP.0 => scroll_by(hwnd, -LINE_STEP),
                c if c == SB_PAGEDOWN.0 => scroll_by(hwnd, h),
                c if c == SB_PAGEUP.0 => scroll_by(hwnd, -h),
                c if c == SB_TOP.0 => scroll_to(hwnd, 0),
                c if c == SB_BOTTOM.0 => scroll_to(hwnd, i32::MAX / 2),
                c if c == SB_THUMBTRACK.0 || c == SB_THUMBPOSITION.0 => {
                    let mut info = SCROLLINFO {
                        cbSize: std::mem::size_of::<SCROLLINFO>() as u32,
                        fMask: SIF_ALL | SIF_TRACKPOS,
                        ..Default::default()
                    };
                    if GetScrollInfo(hwnd, SB_VERT, &mut info).is_ok() {
                        scroll_to(hwnd, info.nTrackPos);
                    }
                }
                _ => {}
            }
        }
        WM_NCDESTROY => {
            let ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut View;
            if !ptr.is_null() {
                drop(Box::from_raw(ptr));
            }
        }
        _ => return None,
    }
    Some(LRESULT(0))
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // A panic must never unwind into Explorer's message loop
    let handled = catch_unwind(AssertUnwindSafe(|| {
        handle_message(hwnd, msg, wparam, lparam)
    }));
    match handled {
        Ok(Some(result)) => result,
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
