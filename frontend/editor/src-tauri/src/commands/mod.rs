#[cfg(desktop)]
pub mod backend;
pub mod files;
pub mod file_drop;
pub mod connection;
pub mod auth;
#[cfg(desktop)]
pub mod default_app;
pub mod local_proxy;
pub mod platform;
pub mod print;
#[cfg(desktop)]
pub mod updater;
pub mod watcher;
#[cfg(mobile)]
pub mod mobile_stubs;
pub mod window;

#[cfg(desktop)]
pub use backend::{cleanup_backend, get_backend_port, start_backend};
#[cfg(mobile)]
pub use mobile_stubs::{
    can_install_updates, check_for_update, cleanup_backend, download_and_install_update,
    get_app_version, get_backend_port, is_default_pdf_handler, restart_app,
    set_as_default_pdf_handler, start_backend,
};
pub use files::{
    add_opened_file, clear_opened_files, file_disk_state, get_opened_files, pop_opened_files,
};
pub use watcher::{release_window_watches, unwatch_disk_paths, watch_disk_paths};
pub use window::{
    build_main_window,
    forward_files_to_window,
    open_files_in_new_window,
    open_in_new_window,
    pop_window_file_ids,
    target_window_label,
    MAIN_WINDOW_LABEL,
};
pub use connection::{
    get_connection_config,
    get_update_mode,
    is_first_launch,
    reset_setup_completion,
    set_connection_mode,
    set_update_mode,
};
pub use auth::{
    clear_auth_token,
    clear_refresh_token,
    clear_user_info,
    get_auth_token,
    get_refresh_token,
    get_user_info,
    login,
    save_auth_token,
    save_refresh_token,
    save_user_info,
    start_oauth_login,
};
#[cfg(desktop)]
pub use default_app::{is_default_pdf_handler, set_as_default_pdf_handler};
pub use local_proxy::proxy_local_pdf_request;
pub use platform::get_desktop_os;
pub use print::print_pdf_file_native;
#[cfg(desktop)]
pub use updater::{
    can_install_updates, check_for_update, download_and_install_update, get_app_version,
    restart_app,
};
