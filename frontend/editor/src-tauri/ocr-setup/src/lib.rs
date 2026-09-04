//! Downloads the OCR runtime while the MSI is installing, with a progress bar.
//!
//! The desktop installer no longer carries a Tesseract runtime, so the wizard
//! asks whether OCR is wanted and which languages, and this action fetches them
//! at that point rather than making the user go looking afterwards.
//!
//! Two rules shape everything here:
//!
//! 1. **A failure must never fail the install.** A corporate proxy that wants
//!    user credentials, a firewall, a laptop that lost its wifi mid-wizard - all
//!    of these are ordinary, and none of them is a reason to roll back an
//!    otherwise good installation of a PDF editor. The action always reports
//!    success, records what went wrong in the installer log, and leaves a note
//!    the application picks up so it can offer to retry with a real UI.
//! 2. **Nothing is trusted without its digest.** This writes executable code
//!    next to the application, from a machine running elevated. Every artefact
//!    is checked against the SHA-256 the catalogue gave for it, and a mismatch
//!    means nothing is installed at all.

mod msi;

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use msi::Handle;

/// Ceilings that turn a hostile or broken archive into a clean failure rather
/// than a full disk on someone's machine.
const MAX_ARCHIVE_BYTES: u64 = 300 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 700 * 1024 * 1024;
const MAX_ENTRIES: usize = 5_000;

/// The bar is driven in ticks; bytes would overflow the installer's i32.
const TICKS: i32 = 1_000;

#[derive(Debug, Deserialize)]
struct Manifest {
    #[serde(default)]
    engine: std::collections::HashMap<String, Artifact>,
    #[serde(default)]
    extras: std::collections::HashMap<String, Artifact>,
    #[serde(default)]
    languages: std::collections::HashMap<String, Artifact>,
}

#[derive(Debug, Clone, Deserialize)]
struct Artifact {
    url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    sha256: String,
    #[serde(default)]
    name: Option<String>,
}

/// What the WiX side packs into `CustomActionData`, pipe separated because the
/// installer hands a deferred action exactly one string.
struct Request {
    manifest_url: String,
    target: PathBuf,
    languages: Vec<String>,
}

fn parse_request(raw: &str) -> Option<Request> {
    let mut parts = raw.splitn(3, '|');
    let manifest_url = parts.next()?.trim().to_string();
    let target = parts.next()?.trim().to_string();
    // The wizard contributes one property per language checkbox and an
    // unattended install passes a list, so the two are simply concatenated on
    // the WiX side. That leaves empty slots and possible repeats, which is why
    // this filters and de-duplicates rather than trusting the input.
    let mut languages: Vec<String> = Vec::new();
    for code in parts.next().unwrap_or("").split(',').map(str::trim) {
        if code.is_empty() || !is_safe_language_code(code) {
            continue;
        }
        if !languages.iter().any(|seen| seen == code) {
            languages.push(code.to_string());
        }
    }

    if manifest_url.is_empty() || target.is_empty() {
        return None;
    }
    Some(Request { manifest_url, target: PathBuf::from(target), languages })
}

/// The same character set the backend accepts. A language code becomes a file
/// name, so anything that could steer a path is refused rather than sanitised.
fn is_safe_language_code(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= 32
        && code
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '+' || c == '-')
}

/// Entry point named by the WiX `CustomAction/@DllEntry`.
///
/// # Safety
/// Called by msiexec with a live session handle.
#[no_mangle]
pub extern "system" fn OcrDownload(install: Handle) -> u32 {
    // Catching the panic matters: an unwind across the FFI boundary into
    // msiexec is undefined behaviour, and this action is explicitly allowed to
    // fail without taking the installation with it.
    let outcome = std::panic::catch_unwind(|| run(install));

    match outcome {
        Ok(Ok(())) => msi::log(install, "OCR components installed"),
        Ok(Err(error)) => {
            msi::log(install, &format!("could not install OCR: {error}"));
            note_pending(install);
        }
        Err(_) => {
            msi::log(install, "panicked while installing OCR");
            note_pending(install);
        }
    }

    // Always. See rule 1 in the module docs.
    msi::ERROR_SUCCESS
}

fn run(install: Handle) -> Result<(), String> {
    let raw = msi::property(install, "CustomActionData");
    let request = parse_request(&raw).ok_or("CustomActionData was not understood")?;

    msi::action_start(install, "StirlingOcrSetup", "Installing text recognition");
    msi::progress_reset(install, TICKS);

    let manifest = fetch_manifest(&request.manifest_url)?;
    let platform = platform_key();
    let engine = manifest
        .engine
        .get(&platform)
        .ok_or_else(|| format!("the catalogue offers no engine for {platform}"))?;

    // Everything that will be fetched, so the bar reflects the whole job rather
    // than restarting per file.
    let mut jobs: Vec<(String, Artifact, bool)> =
        vec![(engine_label(engine), engine.clone(), true)];
    for code in &request.languages {
        if let Some(artifact) = manifest.languages.get(code).or_else(|| manifest.extras.get(code)) {
            jobs.push((label(artifact, code), artifact.clone(), false));
        } else {
            msi::log(install, &format!("the catalogue does not offer '{code}'; skipped"));
        }
    }
    let total_bytes: u64 = jobs.iter().map(|(_, a, _)| a.size.max(1)).sum();

    fs::create_dir_all(&request.target).map_err(|e| format!("{}: {e}", request.target.display()))?;

    let mut ticks_spent = 0i32;
    for (name, artifact, is_engine) in jobs {
        msi::action_data(install, &format!("Downloading {name}"));

        let temp = request.target.join(format!(".incoming-{}", sanitise(&name)));
        let bytes = download(&artifact, &temp, install)
            .map_err(|e| format!("{name}: {e}"))?;

        if is_engine {
            expand_engine(&temp, &request.target)?;
        } else {
            let code = sanitise(&name);
            let _ = code; // the file name comes from the manifest key, not the label
            install_model(&temp, &request.target, &artifact, &name)?;
        }
        let _ = fs::remove_file(&temp);

        let share = (bytes.max(1) as f64 / total_bytes as f64) * TICKS as f64;
        let ticks = share.round() as i32;
        msi::progress_advance(install, ticks);
        ticks_spent += ticks;
    }

    msi::progress_advance(install, TICKS - ticks_spent);
    Ok(())
}

fn engine_label(artifact: &Artifact) -> String {
    artifact.name.clone().unwrap_or_else(|| "the OCR engine".to_string())
}

fn label(artifact: &Artifact, fallback: &str) -> String {
    artifact.name.clone().unwrap_or_else(|| fallback.to_string())
}

fn sanitise(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect()
}

fn platform_key() -> String {
    // Only Windows builds ever run this, but the key must match what the
    // manifest and the backend agree on.
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    format!("windows-{arch}")
}

fn fetch_manifest(url: &str) -> Result<Manifest, String> {
    require_secure(url)?;
    let body = ureq::get(url)
        .timeout(std::time::Duration::from_secs(30))
        .call()
        .map_err(|e| format!("fetching the catalogue: {e}"))?
        .into_string()
        .map_err(|e| format!("reading the catalogue: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("parsing the catalogue: {e}"))
}

/// https or a local file only.
///
/// Plain http would let whoever can rewrite the traffic rewrite the catalogue
/// and the digests inside it in the same breath, which would make the checksum
/// below decorative.
fn require_secure(url: &str) -> Result<(), String> {
    let lowered = url.trim().to_ascii_lowercase();
    if lowered.starts_with("https://") || lowered.starts_with("file:") {
        Ok(())
    } else {
        Err(format!("refusing a non-https address: {url}"))
    }
}

fn download(artifact: &Artifact, target: &Path, install: Handle) -> Result<u64, String> {
    if artifact.sha256.trim().is_empty() {
        return Err("the catalogue lists it without a SHA-256".into());
    }
    require_secure(&artifact.url)?;

    let response = ureq::get(&artifact.url)
        .timeout(std::time::Duration::from_secs(600))
        .call()
        .map_err(|e| format!("{e}"))?;

    let mut reader = response.into_reader().take(MAX_ARCHIVE_BYTES + 1);
    let mut file = File::create(target).map_err(|e| format!("{}: {e}", target.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut written: u64 = 0;

    loop {
        let read = reader.read(&mut buffer).map_err(|e| format!("{e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        file.write_all(&buffer[..read]).map_err(|e| format!("{e}"))?;
        written += read as u64;
        if written > MAX_ARCHIVE_BYTES {
            drop(file);
            let _ = fs::remove_file(target);
            return Err("larger than the size cap".into());
        }
    }
    drop(file);

    if artifact.size > 0 && written != artifact.size {
        let _ = fs::remove_file(target);
        return Err(format!("is {written} bytes, the catalogue says {}", artifact.size));
    }

    let digest = hex(&hasher.finalize());
    if !digest.eq_ignore_ascii_case(artifact.sha256.trim()) {
        let _ = fs::remove_file(target);
        msi::log(install, &format!("SHA-256 mismatch: expected {}, got {digest}", artifact.sha256));
        return Err("SHA-256 mismatch, nothing installed".into());
    }

    Ok(written)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Expands the engine archive, refusing any entry that would land outside the
/// target, and refusing the whole thing if the config files are missing.
fn expand_engine(archive: &Path, target: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| format!("{e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("{e}"))?;

    if zip.len() > MAX_ENTRIES {
        return Err("the archive has too many files".into());
    }

    let root = target.canonicalize().map_err(|e| format!("{e}"))?;
    let mut expanded: u64 = 0;

    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|e| format!("{e}"))?;
        let name = entry.name().to_string();
        let destination = resolve_inside(&root, &name)?;

        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(|e| format!("{e}"))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
        }
        let mut out = File::create(&destination).map_err(|e| format!("{e}"))?;
        let copied = std::io::copy(&mut entry, &mut out).map_err(|e| format!("{e}"))?;
        expanded += copied;
        if expanded > MAX_EXPANDED_BYTES {
            return Err("the archive expands past the size cap".into());
        }
    }

    // Not decoration: "pdf" is the name of a config file Tesseract reads from
    // tessdata/configs, not an output format. Without it the engine exits
    // successfully having written nothing, so OCR would appear installed and
    // silently produce no output.
    if !target.join("tessdata").join("configs").join("pdf").is_file() {
        return Err("the archive has no tessdata/configs/pdf".into());
    }
    Ok(())
}

fn install_model(temp: &Path, target: &Path, artifact: &Artifact, label: &str) -> Result<(), String> {
    let file_name = artifact
        .url
        .rsplit('/')
        .next()
        .filter(|name| name.ends_with(".traineddata"))
        .ok_or_else(|| format!("{label}: the catalogue URL does not name a .traineddata file"))?;

    let tessdata = target.join("tessdata");
    fs::create_dir_all(&tessdata).map_err(|e| format!("{e}"))?;
    let root = tessdata.canonicalize().map_err(|e| format!("{e}"))?;
    let destination = resolve_inside(&root, file_name)?;
    fs::rename(temp, &destination).map_err(|e| format!("{e}"))?;
    Ok(())
}

/// Joins an untrusted relative name onto a trusted root and proves the result
/// stayed inside it. Covers `../`, absolute paths, and drive-qualified ones.
fn resolve_inside(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(relative);
    if candidate.is_absolute() {
        return Err(format!("refusing an absolute path in the archive: {relative}"));
    }
    let mut resolved = root.to_path_buf();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => resolved.push(part),
            Component::CurDir => {}
            _ => return Err(format!("refusing to write outside the target: {relative}")),
        }
    }
    if !resolved.starts_with(root) || resolved == root {
        return Err(format!("refusing to write outside the target: {relative}"));
    }
    Ok(resolved)
}

/// Leaves a breadcrumb the application reads on first launch, so a download
/// that could not happen here becomes an offer to retry rather than silence.
fn note_pending(install: Handle) {
    let raw = msi::property(install, "CustomActionData");
    let Some(request) = parse_request(&raw) else { return };

    let note = serde_json::json!({
        "ocrRequested": true,
        "languages": request.languages,
        "manifestUrl": request.manifest_url,
    });

    if let Some(parent) = request.target.parent() {
        let _ = fs::create_dir_all(parent);
        let _ = fs::write(
            parent.join("stirling-ocr-pending.json"),
            note.to_string(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_traversal_and_absolute_entries() {
        let root = Path::new("C:\\ProgramData\\Stirling-PDF\\tesseract");
        assert!(resolve_inside(root, "../escaped.txt").is_err());
        assert!(resolve_inside(root, "a/../../escaped.txt").is_err());
        assert!(resolve_inside(root, "C:\\Windows\\System32\\evil.dll").is_err());
        assert!(resolve_inside(root, "").is_err());
        assert!(resolve_inside(root, "tessdata/configs/pdf").is_ok());
    }

    #[test]
    fn refuses_plain_http() {
        assert!(require_secure("http://example.invalid/manifest.json").is_err());
        assert!(require_secure("https://example.invalid/manifest.json").is_ok());
        assert!(require_secure("file:///C:/mirror/manifest.json").is_ok());
    }

    #[test]
    fn language_codes_that_could_steer_a_path_are_refused() {
        assert!(is_safe_language_code("spa"));
        assert!(is_safe_language_code("chi_sim"));
        assert!(!is_safe_language_code("../evil"));
        assert!(!is_safe_language_code("a/b"));
        assert!(!is_safe_language_code(""));
    }

    #[test]
    fn parses_the_installer_payload() {
        let request = parse_request(
            "https://example.invalid/m.json|C:\\ProgramData\\Stirling-PDF\\tesseract|spa,eng,../evil",
        )
        .expect("should parse");
        assert_eq!(request.languages, vec!["spa", "eng"]);
        assert!(parse_request("").is_none());
    }

    #[test]
    fn survives_what_the_wizard_actually_sends() {
        // One property per checkbox plus the unattended list, concatenated on
        // the WiX side: unticked boxes leave empty slots and eng arrives twice.
        let request = parse_request(
            "https://example.invalid/m.json|C:\\ProgramData\\Stirling-PDF\\tesseract|eng,,spa,,,eng,cat,",
        )
        .expect("should parse");
        assert_eq!(request.languages, vec!["eng", "spa", "cat"]);
    }
}
