pub mod backend;
pub mod health;
pub mod files;
pub mod default_app;

pub use backend::{start_backend, cleanup_backend};
pub use health::check_backend_health;
pub use files::{get_opened_files, clear_opened_files, add_opened_file};
pub use default_app::{is_default_pdf_handler, set_as_default_pdf_handler};
