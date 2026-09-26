//! The slice of the Windows Installer API this custom action needs.
//!
//! Declared by hand rather than pulling in a Windows bindings crate: six
//! functions against `msi.lib` is a smaller surface than a dependency that
//! generates thousands, and it keeps the DLL small enough to embed in the MSI.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

pub type Handle = u32;

pub const ERROR_SUCCESS: u32 = 0;

/// Sets the line of text under the progress bar.
const INSTALLMESSAGE_ACTIONDATA: u32 = 0x0900_0000;
/// Names the action currently running.
const INSTALLMESSAGE_ACTIONSTART: u32 = 0x0800_0000;
/// Moves the progress bar.
const INSTALLMESSAGE_PROGRESS: u32 = 0x0A00_0000;
/// Goes to the verbose log only.
const INSTALLMESSAGE_INFO: u32 = 0x0400_0000;

#[link(name = "msi")]
extern "system" {
    fn MsiGetPropertyW(
        install: Handle,
        name: *const u16,
        value: *mut u16,
        value_size: *mut u32,
    ) -> u32;
    fn MsiCreateRecord(params: u32) -> Handle;
    fn MsiRecordSetStringW(record: Handle, field: u32, value: *const u16) -> u32;
    fn MsiRecordSetInteger(record: Handle, field: u32, value: i32) -> u32;
    fn MsiProcessMessage(install: Handle, kind: u32, record: Handle) -> i32;
    fn MsiCloseHandle(any: Handle) -> u32;
}

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
}

/// Reads an installer property.
///
/// A deferred custom action can only see `CustomActionData`, which is why the
/// WiX side packs everything it needs into that one string.
pub fn property(install: Handle, name: &str) -> String {
    let name = wide(name);
    let mut size: u32 = 0;
    let mut probe: [u16; 1] = [0];

    // First call reports the length; ERROR_MORE_DATA is expected here.
    unsafe { MsiGetPropertyW(install, name.as_ptr(), probe.as_mut_ptr(), &mut size) };
    if size == 0 {
        return String::new();
    }

    let mut buffer = vec![0u16; size as usize + 1];
    let mut capacity = size + 1;
    let rc = unsafe {
        MsiGetPropertyW(install, name.as_ptr(), buffer.as_mut_ptr(), &mut capacity)
    };
    if rc != ERROR_SUCCESS {
        return String::new();
    }
    buffer.truncate(capacity as usize);
    String::from_utf16_lossy(&buffer)
}

struct Record(Handle);

impl Record {
    fn new(fields: u32) -> Self {
        Record(unsafe { MsiCreateRecord(fields) })
    }

    fn set_string(&self, field: u32, value: &str) {
        let value = wide(value);
        unsafe { MsiRecordSetStringW(self.0, field, value.as_ptr()) };
    }

    fn set_integer(&self, field: u32, value: i32) {
        unsafe { MsiRecordSetInteger(self.0, field, value) };
    }

    fn send(&self, install: Handle, kind: u32) {
        unsafe { MsiProcessMessage(install, kind, self.0) };
    }
}

impl Drop for Record {
    fn drop(&mut self) {
        unsafe { MsiCloseHandle(self.0) };
    }
}

/// Names the step, so the wizard stops showing the previous action's caption.
pub fn action_start(install: Handle, name: &str, description: &str) {
    let record = Record::new(3);
    record.set_string(1, name);
    record.set_string(2, description);
    record.set_string(3, "[1]");
    record.send(install, INSTALLMESSAGE_ACTIONSTART);
}

/// Writes a line to the installer log. Invisible to the user, invaluable
/// afterwards when someone asks why OCR did not arrive.
pub fn log(install: Handle, message: &str) {
    let record = Record::new(1);
    record.set_string(0, &format!("StirlingOcrSetup: {message}"));
    record.send(install, INSTALLMESSAGE_INFO);
}

/// Sets the text under the bar, e.g. "Downloading Espanol".
pub fn action_data(install: Handle, text: &str) {
    let record = Record::new(1);
    record.set_string(1, text);
    record.send(install, INSTALLMESSAGE_ACTIONDATA);
}

/// Starts a fresh progress range owned by this action.
///
/// Field 1 = 0 resets, field 2 is the total number of ticks, field 3 = 0 makes
/// the bar move forward and field 4 = 0 says the script is in progress.
pub fn progress_reset(install: Handle, total_ticks: i32) {
    let record = Record::new(4);
    record.set_integer(1, 0);
    record.set_integer(2, total_ticks);
    record.set_integer(3, 0);
    record.set_integer(4, 0);
    record.send(install, INSTALLMESSAGE_PROGRESS);
}

/// Advances the bar. Field 1 = 2 means "add this many ticks".
pub fn progress_advance(install: Handle, ticks: i32) {
    if ticks <= 0 {
        return;
    }
    let record = Record::new(3);
    record.set_integer(1, 2);
    record.set_integer(2, ticks);
    record.set_integer(3, 0);
    record.send(install, INSTALLMESSAGE_PROGRESS);
}
