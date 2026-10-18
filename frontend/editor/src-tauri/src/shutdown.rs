//! Exit coordination.
//!
//! Tauri hands `RunEvent::ExitRequested` to the run callback, so the backend
//! stop has to start there — but it must neither block that callback nor let
//! the process leave before the stop finishes. This module owns the handshake:
//! the first exit request is prevented, the stop runs on a worker thread, and
//! the worker releases the exit once it is done.
//!
//! A stop that cannot be confirmed still releases the exit: every backend
//! watches `TAURI_PARENT_PID`, so one that outlives the app ends on its own
//! shortly after. The worker says so in the log rather than claiming otherwise.

use std::sync::Mutex;

use tauri::AppHandle;

use crate::utils::add_log;

/// What a pending shutdown will do once the backend has stopped.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShutdownIntent {
    Exit(Option<i32>),
    Restart,
}

/// What the caller of [`ExitCoordinator::request_exit`] should do next.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExitAction {
    /// This request started the shutdown: prevent the exit and spawn the worker.
    StartShutdown,
    /// Shutdown is running: prevent the exit and let the worker release it.
    Wait,
    /// Shutdown has finished: let this request through.
    Proceed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum State {
    Running,
    Stopping(ShutdownIntent),
    ReadyToExit,
}

/// Idempotent exit/restart coordinator: a second request while shutdown runs
/// never starts a second stop, and only the completed state lets an exit pass.
struct ExitCoordinator {
    state: Mutex<State>,
}

impl ExitCoordinator {
    const fn new() -> Self {
        Self {
            state: Mutex::new(State::Running),
        }
    }

    /// Records the request and reports what the caller has to do about it.
    fn request_exit(&self, intent: ShutdownIntent) -> ExitAction {
        let mut state = self.state.lock().unwrap();
        match *state {
            State::Running => {
                *state = State::Stopping(intent);
                ExitAction::StartShutdown
            }
            State::Stopping(current) => {
                // A restart is the stronger request: an update restarting while
                // a quit is already draining must still restart.
                if intent == ShutdownIntent::Restart && current != ShutdownIntent::Restart {
                    *state = State::Stopping(ShutdownIntent::Restart);
                }
                ExitAction::Wait
            }
            State::ReadyToExit => ExitAction::Proceed,
        }
    }

    /// Marks the shutdown work finished and returns what it was for. `None`
    /// when it was not running, so a stray second worker cannot release an exit.
    fn finish(&self) -> Option<ShutdownIntent> {
        let mut state = self.state.lock().unwrap();
        match *state {
            State::Stopping(intent) => {
                *state = State::ReadyToExit;
                Some(intent)
            }
            State::Running | State::ReadyToExit => None,
        }
    }
}

/// The application's coordinator.
static EXIT_COORDINATOR: ExitCoordinator = ExitCoordinator::new();

/// Handles an exit request. Returns `true` when the exit must be prevented for
/// now; the spawned worker releases it by calling [`tauri::AppHandle::exit`].
pub(crate) fn request_exit(code: Option<i32>, app: &AppHandle) -> bool {
    let action = EXIT_COORDINATOR.request_exit(ShutdownIntent::Exit(code));
    match action {
        ExitAction::StartShutdown => {
            add_log("🔄 Exit requested, stopping the backend before quitting".to_string());
            spawn_worker(app.clone());
            true
        }
        ExitAction::Wait => true,
        ExitAction::Proceed => false,
    }
}

/// Routes an update restart through the same shutdown, so the replacement
/// process does not start on top of a live backend.
pub(crate) fn request_restart(app: AppHandle) {
    match EXIT_COORDINATOR.request_exit(ShutdownIntent::Restart) {
        ExitAction::StartShutdown => spawn_worker(app),
        // A quit is already draining the backend; it will be restarted instead
        // of exited because the coordinator keeps the stronger intent.
        ExitAction::Wait => {}
        ExitAction::Proceed => app.restart(),
    }
}

fn spawn_worker(app: AppHandle) {
    std::thread::spawn(move || {
        let report = crate::commands::stop_backend();

        let Some(intent) = EXIT_COORDINATOR.finish() else {
            return;
        };
        match intent {
            ShutdownIntent::Exit(code) => {
                if !report.confirmed_stopped {
                    add_log("⚠️ Backend stop was not confirmed; quitting anyway".to_string());
                }
                app.exit(code.unwrap_or(0));
            }
            ShutdownIntent::Restart => {
                if !report.confirmed_stopped {
                    add_log(format!(
                        "⚠️ Restarting with the backend stop unconfirmed ({:?}); the new instance may find its port busy",
                        report.stop
                    ));
                }
                app.restart();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{ExitAction, ExitCoordinator, ShutdownIntent};

    #[test]
    fn first_request_starts_the_shutdown() {
        let coordinator = ExitCoordinator::new();
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Exit(None)),
            ExitAction::StartShutdown
        );
    }

    #[test]
    fn requests_wait_until_the_worker_finishes_then_proceed() {
        let coordinator = ExitCoordinator::new();
        coordinator.request_exit(ShutdownIntent::Exit(None));

        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Exit(None)),
            ExitAction::Wait
        );
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Restart),
            ExitAction::Wait
        );

        assert_eq!(
            coordinator.finish(),
            Some(ShutdownIntent::Restart),
            "the stronger restart intent must survive the wait"
        );
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Exit(None)),
            ExitAction::Proceed
        );
    }

    #[test]
    fn a_completed_shutdown_is_released_but_never_restarted() {
        let coordinator = ExitCoordinator::new();
        assert_eq!(
            coordinator.finish(),
            None,
            "shutdown cannot finish before it starts"
        );

        coordinator.request_exit(ShutdownIntent::Exit(Some(3)));
        assert_eq!(coordinator.finish(), Some(ShutdownIntent::Exit(Some(3))));
        assert_eq!(coordinator.finish(), None, "finish is one-shot");
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Exit(None)),
            ExitAction::Proceed
        );
    }

    #[test]
    fn exit_intent_keeps_its_code() {
        let coordinator = ExitCoordinator::new();
        coordinator.request_exit(ShutdownIntent::Exit(Some(7)));
        assert_eq!(coordinator.finish(), Some(ShutdownIntent::Exit(Some(7))));
    }

    #[test]
    fn a_restart_that_arrives_first_is_kept() {
        let coordinator = ExitCoordinator::new();
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Restart),
            ExitAction::StartShutdown
        );
        assert_eq!(
            coordinator.request_exit(ShutdownIntent::Exit(None)),
            ExitAction::Wait
        );
        assert_eq!(coordinator.finish(), Some(ShutdownIntent::Restart));
    }
}
