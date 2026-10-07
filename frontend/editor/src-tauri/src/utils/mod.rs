pub mod logging;
pub mod paths;

pub use logging::{add_log, get_tauri_logs};
#[cfg(mobile)]
pub use logging::set_log_directory;
pub use paths::{app_data_dir, system_provisioning_dir};
