//! Background page renderer, so a slow page never blocks the preview window thread.

use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use windows::Data::Pdf::PdfDocument;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Gdi::{DeleteObject, HBITMAP};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_APP};

use crate::{render_page, DLL_REF_COUNT};

/// Posted to the view window when finished renders are ready to collect
pub(crate) const WM_RENDERED: u32 = WM_APP + 1;

/// One page at one size and rotation; a render is only used if it still matches
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct RenderKey {
    pub index: u32,
    pub width: i32,
    pub height: i32,
    pub turns: u8,
}

#[derive(Default)]
struct Shared {
    wanted: HashSet<RenderKey>,
    // Finished renders; a null bitmap means the page failed to render
    done: Vec<(RenderKey, isize)>,
    closed: bool,
}

pub(crate) struct RenderWorker {
    jobs: Option<Sender<RenderKey>>,
    shared: Arc<Mutex<Shared>>,
    // Keys sent or failed, so each is requested once
    requested: HashSet<RenderKey>,
}

// Windows.Data.Pdf objects are agile, so the document can be used from the worker
struct AgileDoc(PdfDocument);
unsafe impl Send for AgileDoc {}

impl RenderWorker {
    pub(crate) fn spawn(doc: PdfDocument, hwnd: HWND) -> Self {
        let shared = Arc::new(Mutex::new(Shared::default()));
        let (tx, rx) = channel::<RenderKey>();
        let worker_shared = shared.clone();
        let doc = AgileDoc(doc);
        let hwnd_raw = hwnd.0 as isize;
        // Keep the DLL loaded until the thread has finished
        DLL_REF_COUNT.fetch_add(1, Ordering::SeqCst);
        std::thread::spawn(move || {
            let doc = doc;
            let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            for key in rx {
                if !lock(&worker_shared).wanted.contains(&key) {
                    continue;
                }
                let bmp = render_key(&doc.0, key).map_or(0, |b| b.0 as isize);
                let mut shared = lock(&worker_shared);
                if shared.closed {
                    delete_raw(bmp);
                    break;
                }
                shared.done.push((key, bmp));
                drop(shared);
                unsafe {
                    let hwnd = HWND(hwnd_raw as *mut c_void);
                    let _ = PostMessageW(hwnd, WM_RENDERED, WPARAM(0), LPARAM(0));
                }
            }
            if com.is_ok() {
                unsafe { CoUninitialize() };
            }
            DLL_REF_COUNT.fetch_sub(1, Ordering::SeqCst);
        });
        Self {
            jobs: Some(tx),
            shared,
            requested: HashSet::new(),
        }
    }

    /// Replaces the set of renders still worth doing; queued jobs outside it are skipped
    pub(crate) fn set_wanted(&mut self, wanted: HashSet<RenderKey>) {
        self.requested.retain(|key| wanted.contains(key));
        lock(&self.shared).wanted = wanted;
    }

    pub(crate) fn request(&mut self, key: RenderKey) {
        if self.requested.insert(key) {
            if let Some(jobs) = &self.jobs {
                let _ = jobs.send(key);
            }
        }
    }

    /// Finished renders; failed pages stay marked as requested so they aren't retried
    pub(crate) fn take_done(&mut self) -> Vec<(RenderKey, HBITMAP)> {
        let done = std::mem::take(&mut lock(&self.shared).done);
        done.into_iter()
            .filter(|&(_, raw)| raw != 0)
            .map(|(key, raw)| {
                self.requested.remove(&key);
                (key, HBITMAP(raw as *mut c_void))
            })
            .collect()
    }
}

impl Drop for RenderWorker {
    fn drop(&mut self) {
        // Closing the channel ends the thread after its current page
        self.jobs = None;
        let mut shared = lock(&self.shared);
        shared.closed = true;
        for (_, raw) in shared.done.drain(..) {
            delete_raw(raw);
        }
    }
}

fn render_key(doc: &PdfDocument, key: RenderKey) -> windows::core::Result<HBITMAP> {
    // Render unrotated, then turn the pixels so the result fills width x height
    let (w, h) = if key.turns % 2 == 1 {
        (key.height, key.width)
    } else {
        (key.width, key.height)
    };
    let page = doc.GetPage(key.index)?;
    render_page(&page, w as u32, h as u32, key.turns)
}

fn delete_raw(raw: isize) {
    if raw != 0 {
        unsafe {
            let _ = DeleteObject(HBITMAP(raw as *mut c_void));
        }
    }
}

fn lock(shared: &Mutex<Shared>) -> std::sync::MutexGuard<'_, Shared> {
    shared
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
