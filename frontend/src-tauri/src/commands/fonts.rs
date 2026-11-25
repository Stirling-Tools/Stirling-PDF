use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::ipc::Response;
use ttf_parser::{name_id, Face, Language, Permissions, Tag};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFace {
    id: usize,
    family: String,
    full_name: String,
    style: String,
    postscript_name: String,
    weight: u16,
    bold: bool,
    italic: bool,
}

struct CatalogEntry {
    face: SystemFontFace,
    path: PathBuf,
}

struct FaceNames {
    style: Option<String>,
    full_name: Option<String>,
}

static CATALOG: OnceLock<Vec<CatalogEntry>> = OnceLock::new();

const SEMIBOLD_WEIGHT: u16 = 600;

/// Must stay equal to the server's `EditorFontRegistry.MAX_FONT_BYTES`: picking a face sends its whole file to the webview.
const MAX_FONT_BYTES: u64 = 64 * 1024 * 1024;

fn has_table(face: &Face, tag: &[u8; 4]) -> bool {
    face.raw_face().table(Tag::from_bytes(tag)).is_some()
}

/// A face with no OS/2 table records no restriction, which is how the server reads it too. One that is present but unreadable is refused.
fn embedding_allowed(face: &Face) -> bool {
    !has_table(face, b"OS/2")
        || (face.permissions() != Some(Permissions::Restricted)
            && face.is_outline_embedding_allowed())
}

/// A PDF embeds only a variable face's default instance. The table's presence decides, as on the server.
fn is_variable(face: &Face) -> bool {
    has_table(face, b"fvar")
}

/// A leading dot on either name marks an OS-private UI face: ".Keyboard", or "System Font" whose PostScript name is ".SFNS-Regular".
fn is_os_private(family: &str, post_script_name: &str) -> bool {
    family.starts_with('.') || post_script_name.starts_with('.')
}

fn fits_size_limit(size: std::io::Result<u64>) -> bool {
    size.is_ok_and(|bytes| bytes <= MAX_FONT_BYTES)
}

fn file_fits_size_limit(path: &Path) -> bool {
    fits_size_limit(std::fs::metadata(path).map(|file| file.len()))
}

/// The editor embeds device fonts as TrueType; a CFF face would save as a broken font resource.
fn has_truetype_outlines(face: &Face) -> bool {
    let tables = face.tables();
    tables.glyf.is_some() && tables.cff.is_none() && tables.cff2.is_none()
}

fn english_name(face: &Face, id: u16) -> Option<String> {
    let mut fallback = None;
    for name in face.names() {
        if name.name_id != id {
            continue;
        }
        let Some(text) = name.to_string().filter(|text| !text.trim().is_empty()) else {
            continue;
        };
        if name.language() == Language::English_UnitedStates {
            return Some(text);
        }
        fallback.get_or_insert(text);
    }
    fallback
}

/// The face's display names, or `None` when it is unparseable, variable, not licensed for embedding, or not TrueType.
fn embeddable_face_names(data: &[u8], index: u32) -> Option<FaceNames> {
    let face = Face::parse(data, index).ok()?;
    if is_variable(&face) || !embedding_allowed(&face) || !has_truetype_outlines(&face) {
        return None;
    }
    Some(FaceNames {
        style: english_name(&face, name_id::TYPOGRAPHIC_SUBFAMILY)
            .or_else(|| english_name(&face, name_id::SUBFAMILY)),
        full_name: english_name(&face, name_id::FULL_NAME),
    })
}

fn is_bold(info: &fontdb::FaceInfo) -> bool {
    info.weight.0 >= SEMIBOLD_WEIGHT
}

fn is_italic(info: &fontdb::FaceInfo) -> bool {
    info.style != fontdb::Style::Normal
}

fn style_from_axes(info: &fontdb::FaceInfo) -> String {
    match (is_bold(info), is_italic(info)) {
        (true, true) => "Bold Italic",
        (true, false) => "Bold",
        (false, true) => "Italic",
        (false, false) => "Regular",
    }
    .to_string()
}

fn source_path(source: &fontdb::Source) -> Option<PathBuf> {
    match source {
        fontdb::Source::File(path) | fontdb::Source::SharedFile(path, _) => Some(path.clone()),
        fontdb::Source::Binary(_) => None,
    }
}

fn build_catalog(db: &fontdb::Database) -> Vec<CatalogEntry> {
    let mut entries = Vec::new();
    for info in db.faces() {
        let Some(path) = source_path(&info.source) else {
            continue;
        };
        let Some((family, _)) = info.families.first() else {
            continue;
        };
        if info.post_script_name.is_empty()
            || is_os_private(family, &info.post_script_name)
            || !file_fits_size_limit(&path)
        {
            continue;
        }
        let Some(names) = db.with_face_data(info.id, embeddable_face_names).flatten() else {
            continue;
        };
        entries.push(CatalogEntry {
            face: SystemFontFace {
                id: entries.len(),
                family: family.clone(),
                full_name: names.full_name.unwrap_or_else(|| family.clone()),
                style: names.style.unwrap_or_else(|| style_from_axes(info)),
                postscript_name: info.post_script_name.clone(),
                weight: info.weight.0,
                bold: is_bold(info),
                italic: is_italic(info),
            },
            path,
        });
    }
    entries
}

fn catalog() -> &'static [CatalogEntry] {
    CATALOG.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let entries = build_catalog(&db);
        log::info!(
            "System fonts: {} of {} installed faces can be embedded",
            entries.len(),
            db.len()
        );
        entries
    })
}

/// The installed faces the editor can embed: static TrueType outlines, a licence that allows embedding, and a file no larger than the server accepts.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFontFace>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        catalog().iter().map(|entry| entry.face.clone()).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// The font file behind an id from [`list_system_fonts`]; an id, not a path, so the webview reads only catalogued files.
#[tauri::command]
pub async fn read_system_font(id: usize) -> Result<Response, String> {
    let path = CATALOG
        .get()
        .and_then(|entries| entries.get(id))
        .map(|entry| entry.path.clone())
        .ok_or_else(|| "Unknown system font".to_string())?;
    tauri::async_runtime::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|e| e.to_string())?
        .map(Response::new)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS_TYPE_OFFSET: usize = 8;
    const TABLE_DIRECTORY_OFFSET: usize = 12;
    const TABLE_RECORD_SIZE: usize = 16;

    fn bundled(name: &str) -> Vec<u8> {
        let dir = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../app/core/src/main/resources/static/fonts/"
        );
        std::fs::read(format!("{dir}{name}")).expect("bundled font is readable")
    }

    fn bundled_font() -> Vec<u8> {
        bundled("Carlito-Regular.ttf")
    }

    fn os2_offset(data: &[u8]) -> usize {
        ttf_parser::RawFace::parse(data, 0)
            .expect("font parses")
            .table(ttf_parser::Tag::from_bytes(b"OS/2"))
            .expect("font has an OS/2 table")
            .as_ptr() as usize
            - data.as_ptr() as usize
    }

    fn with_fs_type(mut data: Vec<u8>, fs_type: u16) -> Vec<u8> {
        let os2 = os2_offset(&data);
        data[os2 + FS_TYPE_OFFSET..os2 + FS_TYPE_OFFSET + 2]
            .copy_from_slice(&fs_type.to_be_bytes());
        data
    }

    fn with_os2_version(mut data: Vec<u8>, version: u16) -> Vec<u8> {
        let os2 = os2_offset(&data);
        data[os2..os2 + 2].copy_from_slice(&version.to_be_bytes());
        data
    }

    /// The parser binary-searches the table directory, so `to` must sort where `from` did.
    fn with_table_renamed(mut data: Vec<u8>, from: &[u8; 4], to: &[u8; 4]) -> Vec<u8> {
        let tables = usize::from(u16::from_be_bytes([data[4], data[5]]));
        let record = (0..tables)
            .map(|table| TABLE_DIRECTORY_OFFSET + table * TABLE_RECORD_SIZE)
            .find(|&record| data[record..record + 4] == from[..])
            .expect("font has the table");
        data[record..record + 4].copy_from_slice(to);
        data
    }

    fn catalog_of(data: Vec<u8>) -> Vec<CatalogEntry> {
        let size = data.len() as u64;
        catalog_of_file_sized(data, size)
    }

    /// Extends the file without writing the tail, so one at the size limit stays cheap to make.
    fn catalog_of_file_sized(data: Vec<u8>, size: u64) -> Vec<CatalogEntry> {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("font.ttf");
        std::fs::write(&path, data).expect("font written");
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .and_then(|file| file.set_len(size))
            .expect("font resized");
        let mut db = fontdb::Database::new();
        db.load_fonts_dir(dir.path());
        build_catalog(&db)
    }

    #[test]
    fn lists_an_embeddable_face_with_its_names() {
        let entries = catalog_of(with_fs_type(bundled_font(), 0x0000));
        assert_eq!(entries.len(), 1);
        let face = &entries[0].face;
        assert_eq!(face.family, "Carlito");
        assert_eq!(face.style, "Regular");
        assert_eq!(face.postscript_name, "Carlito");
        assert_eq!(face.id, 0);
    }

    fn with_name_text(mut data: Vec<u8>, from: &str, to: &str) -> Vec<u8> {
        let name = ttf_parser::RawFace::parse(&data, 0)
            .expect("font parses")
            .table(ttf_parser::Tag::from_bytes(b"name"))
            .expect("font has a name table");
        let start = name.as_ptr() as usize - data.as_ptr() as usize;
        let end = start + name.len();
        let encodings = [
            (from.as_bytes().to_vec(), to.as_bytes().to_vec()),
            (
                from.encode_utf16().flat_map(u16::to_be_bytes).collect(),
                to.encode_utf16().flat_map(u16::to_be_bytes).collect(),
            ),
        ];
        for (needle, replacement) in encodings {
            let mut at = start;
            while at + needle.len() <= end {
                if data[at..at + needle.len()] == needle[..] {
                    data[at..at + needle.len()].copy_from_slice(&replacement);
                    at += needle.len();
                } else {
                    at += 1;
                }
            }
        }
        data
    }

    #[test]
    fn reports_the_style_axes_whatever_language_the_style_name_is_in() {
        let entries = catalog_of(with_name_text(bundled("Carlito-Bold.ttf"), "Bold", "Fett"));
        assert_eq!(entries.len(), 1);
        let face = serde_json::to_value(&entries[0].face).expect("face serialises");
        assert_eq!(face["style"], "Fett");
        assert_eq!(face["bold"], true);
        assert_eq!(face["italic"], false);
        assert_eq!(face["weight"], 700);
    }

    #[test]
    fn reports_an_italic_face_as_italic() {
        let entries = catalog_of(bundled("LiberationSans-Italic.ttf"));
        let face = serde_json::to_value(&entries[0].face).expect("face serialises");
        assert_eq!(face["bold"], false);
        assert_eq!(face["italic"], true);
        assert_eq!(face["weight"], 400);
    }

    #[test]
    fn keeps_preview_and_editable_embedding() {
        assert_eq!(catalog_of(with_fs_type(bundled_font(), 0x0004)).len(), 1);
        assert_eq!(catalog_of(with_fs_type(bundled_font(), 0x0008)).len(), 1);
        assert_eq!(catalog_of(with_fs_type(bundled_font(), 0x0108)).len(), 1);
    }

    #[test]
    fn drops_a_face_whose_licence_forbids_embedding() {
        assert!(catalog_of(with_fs_type(bundled_font(), 0x0002)).is_empty());
    }

    #[test]
    fn drops_a_bitmap_only_face() {
        assert!(catalog_of(with_fs_type(bundled_font(), 0x0208)).is_empty());
    }

    #[test]
    fn lists_a_face_with_no_os2_table() {
        let entries = catalog_of(with_table_renamed(bundled_font(), b"OS/2", b"OS/1"));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].face.family, "Carlito");
    }

    #[test]
    fn drops_a_face_whose_os2_table_cannot_be_read() {
        let unreadable = with_os2_version(with_fs_type(bundled_font(), 0x0002), 0xFFFF);
        assert!(catalog_of(unreadable).is_empty());
    }

    #[test]
    fn drops_a_face_with_an_fvar_table() {
        assert!(catalog_of(with_table_renamed(bundled_font(), b"fpgm", b"fvar")).is_empty());
    }

    #[test]
    fn a_leading_dot_on_either_name_is_os_private() {
        assert!(is_os_private(".Keyboard", "Keyboard"));
        assert!(is_os_private("System Font", ".SFNS-Regular"));
        assert!(!is_os_private("Carlito", "Carlito-Bold"));
    }

    #[test]
    fn drops_a_face_whose_postscript_name_is_os_private() {
        let entries = catalog_of(with_name_text(
            bundled("Carlito-Bold.ttf"),
            "Carlito-Bold",
            ".arlito-Bold",
        ));
        assert!(entries.is_empty());
    }

    #[test]
    fn a_size_that_is_too_large_or_unreadable_does_not_fit() {
        assert!(fits_size_limit(Ok(MAX_FONT_BYTES)));
        assert!(!fits_size_limit(Ok(MAX_FONT_BYTES + 1)));
        assert!(!fits_size_limit(Err(std::io::ErrorKind::NotFound.into())));
    }

    #[test]
    fn drops_a_file_over_the_size_limit() {
        assert_eq!(
            catalog_of_file_sized(bundled_font(), MAX_FONT_BYTES).len(),
            1
        );
        assert!(catalog_of_file_sized(bundled_font(), MAX_FONT_BYTES + 1).is_empty());
    }

    #[test]
    fn drops_a_face_with_postscript_outlines() {
        assert!(catalog_of(bundled("NotoSansTC-Regular.ttf")).is_empty());
    }

    #[test]
    fn drops_an_unparseable_face() {
        assert!(embeddable_face_names(b"not a font", 0).is_none());
    }
}
