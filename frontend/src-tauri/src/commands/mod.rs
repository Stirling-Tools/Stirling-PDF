pub mod backend;
pub mod health;
pub mod files;

pub use backend::{start_backend, cleanup_backend};
pub use health::check_backend_health;
pub use files::{get_opened_file, clear_opened_file};
#[cfg(target_os = "macos")]
pub use files::set_opened_file;
