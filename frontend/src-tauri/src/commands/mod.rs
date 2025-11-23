pub mod backend;
pub mod files;
pub mod connection;
pub mod auth;
pub mod default_app;
pub mod health;

pub use backend::{cleanup_backend, get_backend_port, start_backend};
pub use files::{add_opened_file, clear_opened_files, get_opened_files};
pub use connection::{
    get_connection_config,
    is_first_launch,
    reset_setup_completion,
    set_connection_mode,
};
pub use auth::{
    clear_auth_token,
    clear_user_info,
    get_auth_token,
    get_user_info,
    login,
    save_auth_token,
    save_user_info,
};
pub use default_app::{is_default_pdf_handler, set_as_default_pdf_handler};
pub use health::check_backend_health;
