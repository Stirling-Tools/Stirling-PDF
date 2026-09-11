use crate::commands::files::{classify_absence, Absence};
use crate::utils::add_log;
use notify::event::{ModifyKind, RemoveKind};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

static WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
static CLAIMS: Mutex<BTreeMap<String, Vec<String>>> = Mutex::new(BTreeMap::new());
static WATCHED_DIRS: Mutex<BTreeSet<PathBuf>> = Mutex::new(BTreeSet::new());
static ROUTES: Mutex<Option<Arc<Routes>>> = Mutex::new(None);

#[derive(Default)]
struct Routes {
    files: HashMap<PathBuf, Vec<String>>,
    dirs: HashMap<PathBuf, Vec<String>>,
}

impl Routes {
    fn add(&mut self, dir: &Path, file_name: &Path, given: &str) {
        push_unique(self.files.entry(dir.join(file_name)).or_default(), given);
        push_unique(self.dirs.entry(dir.to_path_buf()).or_default(), given);
    }

    fn all_given(&self) -> Vec<String> {
        let mut all: Vec<String> = Vec::new();
        for given in self.files.values().flatten() {
            push_unique(&mut all, given);
        }
        all
    }
}

fn push_unique(into: &mut Vec<String>, given: &str) {
    if !into.iter().any(|held| held == given) {
        into.push(given.to_string());
    }
}

struct WatchTarget<'a> {
    given: &'a str,
    parent: PathBuf,
    file_name: PathBuf,
}

impl<'a> WatchTarget<'a> {
    fn parse(given: &'a str) -> Option<Self> {
        let path = Path::new(given);
        if !path.is_absolute() {
            return None;
        }
        Some(Self {
            given,
            parent: path.parent()?.to_path_buf(),
            file_name: PathBuf::from(path.file_name()?),
        })
    }
}

#[derive(Clone, Serialize)]
struct DiskChangePayload {
    paths: Vec<String>,
}

pub const DISK_CHANGE_EVENT: &str = "disk-files-changed";

fn build_routes(paths: &[String]) -> (Routes, BTreeSet<PathBuf>) {
    let mut routes = Routes::default();
    let mut dirs: BTreeSet<PathBuf> = BTreeSet::new();

    for given in paths {
        let Some(target) = WatchTarget::parse(given) else {
            add_log(format!("⚠️ Not a watchable file path: {}", given));
            continue;
        };

        let resolved = target
            .parent
            .canonicalize()
            .unwrap_or_else(|_| target.parent.clone());

        // A case- or normalisation-differing spelling still opens the file on
        // Windows and macOS, so the frontend can hold one spelling while the OS
        // reports another and every event misses, silently.
        let on_disk_name = Path::new(target.given)
            .canonicalize()
            .ok()
            .and_then(|full| full.file_name().map(PathBuf::from));

        for parent in [&target.parent, &resolved] {
            routes.add(parent, &target.file_name, target.given);
            if let Some(name) = &on_disk_name {
                routes.add(parent, name, target.given);
            }
        }

        dirs.insert(target.parent);
    }

    (routes, dirs)
}

// Only content/existence changes matter. Access events (someone opened the file
// for reading) would fire constantly and mean nothing to us.
fn is_interesting(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

fn may_be_folder_loss(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Remove(RemoveKind::Folder | RemoveKind::Any)
            | EventKind::Modify(ModifyKind::Name(_))
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DirState {
    Present,
    Gone,
    Unknown,
}

fn classify_dir_metadata(
    metadata: io::Result<std::fs::Metadata>,
    absence: impl Fn() -> Absence,
) -> DirState {
    match metadata {
        Ok(meta) if meta.is_dir() => DirState::Present,
        Ok(_) => DirState::Gone,
        Err(e) if e.kind() == io::ErrorKind::NotFound => match absence() {
            Absence::Deleted => DirState::Gone,
            Absence::Unreachable => DirState::Unknown,
        },
        Err(_) => DirState::Unknown,
    }
}

fn route_event(
    routes: &Routes,
    event: &Event,
    probe: impl Fn(&Path) -> DirState,
) -> Option<DiskChangePayload> {
    if event.need_rescan() {
        return payload(routes.all_given());
    }
    if !is_interesting(&event.kind) {
        return None;
    }

    let mut affected: Vec<String> = Vec::new();
    for path in &event.paths {
        if let Some(given) = routes.files.get(path) {
            for one in given {
                push_unique(&mut affected, one);
            }
        }
        if !may_be_folder_loss(&event.kind) {
            continue;
        }
        let Some(children) = routes.dirs.get(path) else {
            continue;
        };
        match probe(path) {
            DirState::Gone => {
                for one in children {
                    push_unique(&mut affected, one);
                }
            }
            DirState::Present | DirState::Unknown => {}
        }
    }

    payload(affected)
}

fn payload(paths: Vec<String>) -> Option<DiskChangePayload> {
    if paths.is_empty() {
        None
    } else {
        Some(DiskChangePayload { paths })
    }
}

fn dir_state(dir: &Path) -> DirState {
    classify_dir_metadata(std::fs::metadata(dir), || classify_absence(dir))
}

fn current_routes() -> Option<Arc<Routes>> {
    let guard = ROUTES.lock().ok()?;
    (*guard).clone()
}

fn reconcile(
    app: &AppHandle,
    label: &str,
    paths: Vec<String>,
    live: &[String],
) -> Result<(), String> {
    let mut watcher_guard = WATCHER.lock().map_err(|e| e.to_string())?;

    let union = {
        let mut claims = CLAIMS.lock().map_err(|e| e.to_string())?;
        claims.retain(|owner, _| live.iter().any(|l| l == owner));
        if paths.is_empty() || !live.iter().any(|l| l == label) {
            claims.remove(label);
        } else {
            claims.insert(label.to_string(), paths);
        }
        claims.values().flatten().cloned().collect::<Vec<String>>()
    };

    let (routes, dirs) = build_routes(&union);
    *ROUTES.lock().map_err(|e| e.to_string())? = Some(Arc::new(routes));

    if dirs.is_empty() {
        *watcher_guard = None;
        WATCHED_DIRS.lock().map_err(|e| e.to_string())?.clear();
        return Ok(());
    }

    let mut current = WATCHED_DIRS.lock().map_err(|e| e.to_string())?;
    if watcher_guard.is_some() && *current == dirs {
        return Ok(());
    }

    let handler_app = app.clone();
    let mut watcher = notify::recommended_watcher(move |result| match result {
        Ok(event) => {
            let Some(routes) = current_routes() else {
                return;
            };
            if let Some(payload) = route_event(&routes, &event, dir_state) {
                if let Err(e) = handler_app.emit(DISK_CHANGE_EVENT, payload) {
                    add_log(format!("⚠️ Failed to emit disk change event: {}", e));
                }
            }
        }
        Err(e) => add_log(format!("⚠️ File watcher error: {}", e)),
    })
    .map_err(|e| e.to_string())?;

    // A folder that has itself been removed just means nothing to watch there.
    let mut watched: BTreeSet<PathBuf> = BTreeSet::new();
    for dir in dirs {
        match watcher.watch(&dir, RecursiveMode::NonRecursive) {
            Ok(()) => {
                watched.insert(dir);
            }
            Err(e) => add_log(format!("⚠️ Could not watch {}: {}", dir.display(), e)),
        }
    }

    add_log(format!(
        "👀 Watching {} folder(s) for disk changes",
        watched.len()
    ));
    *current = watched;
    *watcher_guard = Some(watcher);
    Ok(())
}

fn live_labels(app: &AppHandle) -> Vec<String> {
    app.webview_windows().into_keys().collect()
}

#[tauri::command]
pub fn watch_disk_paths(window: WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    let app = window.app_handle().clone();
    let live = live_labels(&app);
    reconcile(&app, window.label(), paths, &live)
}

#[tauri::command]
pub fn unwatch_disk_paths(window: WebviewWindow) -> Result<(), String> {
    let app = window.app_handle().clone();
    let live = live_labels(&app);
    reconcile(&app, window.label(), Vec::new(), &live)
}

pub fn release_window_watches(app: &AppHandle, label: &str) {
    let live = live_labels(app);
    if let Err(e) = reconcile(app, label, Vec::new(), &live) {
        add_log(format!("⚠️ Failed to release watches for {}: {}", label, e));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, Flag, RenameMode};

    fn event(kind: EventKind, paths: &[&str]) -> Event {
        Event {
            kind,
            paths: paths.iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        }
    }

    fn routed(routes: &Routes, event: &Event, probe: DirState) -> Vec<String> {
        route_event(routes, event, |_| probe)
            .map(|p| {
                let mut paths = p.paths;
                paths.sort();
                paths
            })
            .unwrap_or_default()
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("stirling_w_{}_{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_content_and_existence_events_are_interesting() {
        assert!(is_interesting(&EventKind::Create(CreateKind::File)));
        assert!(is_interesting(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(is_interesting(&EventKind::Remove(RemoveKind::File)));
        // A read is not a change; these would otherwise fire constantly.
        assert!(!is_interesting(&EventKind::Access(
            notify::event::AccessKind::Read
        )));
        assert!(!is_interesting(&EventKind::Any));
    }

    #[test]
    fn events_outside_the_linked_set_are_ignored() {
        let (routes, _) = build_routes(&[abs("/docs/report.pdf")]);

        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                    &[&abs("/docs/report.pdf")]
                ),
                DirState::Present
            ),
            vec![abs("/docs/report.pdf")]
        );
        // Same folder, different file - a busy Downloads folder must stay quiet.
        assert!(routed(
            &routes,
            &event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                &[&abs("/docs/unrelated.pdf")]
            ),
            DirState::Present
        )
        .is_empty());
        assert!(routed(
            &routes,
            &event(EventKind::Create(CreateKind::File), &[&abs("/docs")]),
            DirState::Gone
        )
        .is_empty());
    }

    #[test]
    fn a_lost_folder_stands_for_the_linked_files_that_were_in_it() {
        let (routes, _) = build_routes(&[abs("/docs/a.pdf"), abs("/docs/b.pdf")]);
        let removed = event(EventKind::Remove(RemoveKind::Folder), &[&abs("/docs")]);

        assert_eq!(
            routed(&routes, &removed, DirState::Gone),
            vec![abs("/docs/a.pdf"), abs("/docs/b.pdf")]
        );
        assert!(routed(&routes, &removed, DirState::Present).is_empty());
        assert!(routed(&routes, &removed, DirState::Unknown).is_empty());
    }

    #[test]
    fn a_renamed_folder_is_a_loss_too() {
        let (routes, _) = build_routes(&[abs("/docs/a.pdf")]);
        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
                    &[&abs("/docs")]
                ),
                DirState::Gone
            ),
            vec![abs("/docs/a.pdf")]
        );
    }

    #[test]
    fn an_unmounted_volume_is_not_a_deleted_folder() {
        let (routes, _) = build_routes(&[abs("/docs/a.pdf")]);
        assert!(!may_be_folder_loss(&EventKind::Remove(RemoveKind::Other)));
        assert!(routed(
            &routes,
            &event(EventKind::Remove(RemoveKind::Other), &[&abs("/docs")]),
            DirState::Gone
        )
        .is_empty());
    }

    #[test]
    fn a_dropped_event_notice_stands_for_every_linked_file() {
        let (routes, _) = build_routes(&[abs("/docs/a.pdf"), abs("/other/b.pdf")]);
        let mut rescan = event(EventKind::Other, &[]);
        rescan.attrs.set_flag(Flag::Rescan);

        assert_eq!(
            routed(&routes, &rescan, DirState::Present),
            vec![abs("/docs/a.pdf"), abs("/other/b.pdf")]
        );
    }

    #[test]
    fn only_absolute_paths_naming_a_file_are_watchable() {
        assert!(WatchTarget::parse("report.pdf").is_none());
        assert!(WatchTarget::parse(&abs("/docs/report.pdf")).is_some());
    }

    #[test]
    fn each_folder_is_registered_once() {
        let (_, dirs) =
            build_routes(&[abs("/docs/a.pdf"), abs("/docs/b.pdf"), abs("/other/c.pdf")]);
        assert_eq!(dirs.len(), 2);
    }

    #[test]
    fn a_watch_list_is_handed_over_exactly_as_given() {
        let given = abs("/docs/report.pdf");
        let (_, dirs) = build_routes(std::slice::from_ref(&given));
        let parent = Path::new(&given).parent().unwrap();
        assert!(dirs.contains(parent));
    }

    #[cfg(unix)]
    #[test]
    fn both_spellings_of_one_folder_are_registered() {
        let root = temp_dir("aliased");
        let real = root.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let via_link = link.join("a.pdf").to_string_lossy().to_string();
        let via_real = real.join("b.pdf").to_string_lossy().to_string();
        let (_, dirs) = build_routes(&[via_link, via_real]);

        assert!(
            dirs.contains(&link),
            "the symlinked spelling must be watched"
        );
        assert!(
            dirs.contains(&real),
            "the real spelling must be watched too"
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn only_a_removal_or_rename_is_worth_asking_the_filesystem_about() {
        assert!(may_be_folder_loss(&EventKind::Remove(RemoveKind::Folder)));
        assert!(may_be_folder_loss(&EventKind::Remove(RemoveKind::Any)));
        assert!(may_be_folder_loss(&EventKind::Modify(ModifyKind::Name(
            RenameMode::Any
        ))));
        assert!(!may_be_folder_loss(&EventKind::Create(CreateKind::Folder)));
        assert!(!may_be_folder_loss(&EventKind::Modify(
            ModifyKind::Metadata(notify::event::MetadataKind::Extended)
        )));
    }

    #[test]
    fn an_unreadable_folder_is_not_a_deleted_one() {
        let denied = io::Error::from(io::ErrorKind::PermissionDenied);
        assert_eq!(
            classify_dir_metadata(Err(denied), || Absence::Deleted),
            DirState::Unknown
        );
    }

    #[test]
    fn a_missing_folder_defers_to_the_shared_absence_classifier() {
        let missing = || io::Error::from(io::ErrorKind::NotFound);
        assert_eq!(
            classify_dir_metadata(Err(missing()), || Absence::Deleted),
            DirState::Gone
        );
        assert_eq!(
            classify_dir_metadata(Err(missing()), || Absence::Unreachable),
            DirState::Unknown
        );
    }

    #[test]
    fn a_folder_state_is_read_off_the_filesystem() {
        let dir = temp_dir("dir_state");
        assert_eq!(dir_state(&dir), DirState::Present);
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(dir_state(&dir), DirState::Gone);
    }

    #[cfg(unix)]
    #[test]
    fn a_file_under_a_symlinked_folder_is_keyed_by_its_resolved_parent() {
        let root = temp_dir("symlink");
        let real = root.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let given = link.join("report.pdf").to_string_lossy().to_string();
        let reported = real.canonicalize().unwrap().join("report.pdf");

        let (routes, dirs) = build_routes(std::slice::from_ref(&given));

        assert_ne!(
            reported.to_string_lossy().to_string(),
            given,
            "the symlink must actually resolve for this to test anything"
        );
        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                    &[&reported.to_string_lossy()]
                ),
                DirState::Present
            ),
            vec![given.clone()]
        );
        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                    &[&given]
                ),
                DirState::Present
            ),
            vec![given]
        );
        assert_eq!(dirs.len(), 1, "one folder, reached by two names");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_lost_symlinked_folder_stands_for_the_files_reached_through_it() {
        let root = temp_dir("symlink_loss");
        let real = root.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let given = link.join("report.pdf").to_string_lossy().to_string();
        let (routes, _) = build_routes(std::slice::from_ref(&given));

        let reported_dir = real.canonicalize().unwrap();
        assert_ne!(reported_dir, real, "the symlink must actually resolve");
        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Remove(RemoveKind::Folder),
                    &[&reported_dir.to_string_lossy()]
                ),
                DirState::Gone
            ),
            vec![given]
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn two_names_for_one_file_both_come_back() {
        let root = temp_dir("two_names");
        let real = root.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let via_link = link.join("report.pdf").to_string_lossy().to_string();
        let via_real = real.join("report.pdf").to_string_lossy().to_string();
        let (routes, _) = build_routes(&[via_link.clone(), via_real.clone()]);

        let mut expected = vec![via_link, via_real];
        expected.sort();
        let reported = real.canonicalize().unwrap().join("report.pdf");
        assert_eq!(
            routed(
                &routes,
                &event(
                    EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                    &[&reported.to_string_lossy()]
                ),
                DirState::Present
            ),
            expected
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_union_of_two_windows_is_what_gets_watched() {
        let mut claims: BTreeMap<String, Vec<String>> = BTreeMap::new();
        claims.insert("main".into(), vec![abs("/docs/a.pdf")]);
        claims.insert("main-2".into(), vec![abs("/other/b.pdf")]);
        let union: Vec<String> = claims.values().flatten().cloned().collect();

        let (routes, dirs) = build_routes(&union);
        assert_eq!(dirs.len(), 2);
        for path in [abs("/docs/a.pdf"), abs("/other/b.pdf")] {
            assert_eq!(
                routed(
                    &routes,
                    &event(
                        EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                        &[&path]
                    ),
                    DirState::Present
                ),
                vec![path]
            );
        }

        claims.remove("main-2");
        let (_, remaining) = build_routes(&claims.values().flatten().cloned().collect::<Vec<_>>());
        assert_eq!(remaining.len(), 1);
    }

    fn abs(unix_path: &str) -> String {
        if cfg!(windows) {
            format!("C:{}", unix_path.replace('/', "\\"))
        } else {
            unix_path.to_string()
        }
    }
}
