import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

/**
 * The desktop shell's answers to the Tauri commands the editor calls, as a
 * desktop install in local mode gives them: the bundled backend is up, no
 * account is signed in, no file was opened from the OS and no update is
 * pending. A command missing here answers null, as an unset value does.
 *
 * Stories reach other setups (a cloud account, a self-hosted server) the way a
 * user does, through the editor's own connection settings, not by changing
 * these answers mid-page: the connection service reads them once per page.
 */
const DESKTOP_ANSWERS: Readonly<Record<string, unknown>> = {
  get_backend_port: 8080,
  start_backend: "started",
  get_connection_config: {
    mode: "local",
    server_config: null,
    lock_connection_mode: false,
    require_sign_in: false,
    cloud_only: false,
    local_processing_only: false,
  },
  is_first_launch: false,
  get_desktop_os: "macos",
  get_app_version: "0.0.0-storybook",
  "plugin:app|version": "0.0.0-storybook",
  get_update_mode: { mode: "disabled", locked: false },
  can_install_updates: { canInstall: false, reason: null, installDir: null },
  check_for_update: null,
  get_opened_files: [],
  pop_opened_files: [],
  pop_window_file_ids: [],
  list_system_fonts: [],
  holds_writable_lock: false,
  is_default_pdf_handler: true,
  get_refresh_token: null,
};

/**
 * The OS keyring: empty, so no account is signed in, and it keeps what the
 * editor saves until the editor clears it, as the real keyring does. A story
 * signs in by saving a session through the same commands.
 */
const keyring: { token: string | null; userInfo: unknown } = {
  token: null,
  userInfo: null,
};

function namedArgs(args: InvokeArgs | undefined): Record<string, unknown> {
  return args &&
    !Array.isArray(args) &&
    !ArrayBuffer.isView(args) &&
    !(args instanceof ArrayBuffer)
    ? args
    : {};
}

function keyringAnswer(
  command: string,
  args: Record<string, unknown>,
): { handled: boolean; answer?: unknown } {
  switch (command) {
    case "save_auth_token":
      keyring.token = typeof args.token === "string" ? args.token : null;
      return { handled: true };
    case "get_auth_token":
      return { handled: true, answer: keyring.token };
    case "clear_auth_token":
      keyring.token = null;
      return { handled: true };
    case "save_user_info":
      keyring.userInfo = { username: args.username, email: args.email };
      return { handled: true };
    case "get_user_info":
      return { handled: true, answer: keyring.userInfo };
    case "clear_user_info":
      keyring.userInfo = null;
      return { handled: true };
    default:
      return { handled: false };
  }
}

/** Installs the desktop shell's IPC answers; call before any story renders. */
export function mockDesktopIpc(): void {
  mockWindows("main");
  mockIPC(
    (command, args) => {
      const fromKeyring = keyringAnswer(command, namedArgs(args));
      if (fromKeyring.handled) return fromKeyring.answer ?? null;
      return command in DESKTOP_ANSWERS ? DESKTOP_ANSWERS[command] : null;
    },
    { shouldMockEvents: true },
  );
}
