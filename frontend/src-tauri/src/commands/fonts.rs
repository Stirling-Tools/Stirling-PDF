use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::ipc::Response;
use ttf_parser::{name_id, Face, Language, Permissions};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFace {
    id: usize,
    family: String,
    full_name: String,
    style: String,
    postscript_name: String,
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

fn embedding_allowed(face: &Face) -> bool {
    face.permissions() != Some(Permissions::Restricted) && face.is_outline_embedding_allowed()
}

/// The editor embeds device fonts as TrueType, which PostScript (CFF) outlines
/// are not: such a face would save as a broken font resource.
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

/// The face's display names, or `None` when it cannot be parsed, its licence
/// forbids embedding, or its outlines are not TrueType: an unreadable
/// permission is treated as a refusal.
fn embeddable_face_names(data: &[u8], index: u32) -> Option<FaceNames> {
    let face = Face::parse(data, index).ok()?;
    if !embedding_allowed(&face) || !has_truetype_outlines(&face) {
        return None;
    }
    Some(FaceNames {
        style: english_name(&face, name_id::TYPOGRAPHIC_SUBFAMILY)
            .or_else(|| english_name(&face, name_id::SUBFAMILY)),
        full_name: english_name(&face, name_id::FULL_NAME),
    })
}

fn style_from_axes(info: &fontdb::FaceInfo) -> String {
    let bold = info.weight.0 >= 600;
    let italic = info.style != fontdb::Style::Normal;
    match (bold, italic) {
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
        // A leading dot marks an OS-private UI face (".SF NS", ".Keyboard").
        if family.starts_with('.') || info.post_script_name.is_empty() {
            continue;
        }
        let Some(names) = db
            .with_face_data(info.id, embeddable_face_names)
            .flatten()
        else {
            continue;
        };
        entries.push(CatalogEntry {
            face: SystemFontFace {
                id: entries.len(),
                family: family.clone(),
                full_name: names.full_name.unwrap_or_else(|| family.clone()),
                style: names.style.unwrap_or_else(|| style_from_axes(info)),
                postscript_name: info.post_script_name.clone(),
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

/// The installed font faces the editor can embed in a document: TrueType
/// outlines, and a licence that allows embedding.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFontFace>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        catalog().iter().map(|entry| entry.face.clone()).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// The font file behind an id from [`list_system_fonts`]. Takes an id rather
/// than a path so the webview can only ever read files the catalog found.
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

    fn with_fs_type(mut data: Vec<u8>, fs_type: u16) -> Vec<u8> {
        let os2 = ttf_parser::RawFace::parse(&data, 0)
            .expect("font parses")
            .table(ttf_parser::Tag::from_bytes(b"OS/2"))
            .expect("font has an OS/2 table")
            .as_ptr() as usize
            - data.as_ptr() as usize;
        data[os2 + FS_TYPE_OFFSET..os2 + FS_TYPE_OFFSET + 2].copy_from_slice(&fs_type.to_be_bytes());
        data
    }

    fn catalog_of(data: Vec<u8>) -> Vec<CatalogEntry> {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::write(dir.path().join("font.ttf"), data).expect("font written");
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
    fn drops_a_face_with_postscript_outlines() {
        assert!(catalog_of(bundled("NotoSansTC-Regular.ttf")).is_empty());
    }

    #[test]
    fn drops_an_unparseable_face() {
        assert!(embeddable_face_names(b"not a font", 0).is_none());
    }
}
