//! Embeds core.json and every language pack, minified, so the browser and
//! server builds carry the same rules and adding a pack needs no code change.

use std::fmt::Write;
use std::path::Path;
use std::{env, fs};

// Hazard: the rules are shared with the TypeScript heuristic, which loads
// them from the same directory.
const RULES_DIR: &str = "../../../frontend/editor/src/proprietary/services/heuristic/rules";

fn main() {
    let rules = Path::new(env!("CARGO_MANIFEST_DIR")).join(RULES_DIR);
    let packs_dir = rules.join("packs");
    println!("cargo:rerun-if-changed={}", rules.display());
    println!("cargo:rerun-if-changed={}", packs_dir.display());

    let mut packs: Vec<_> = fs::read_dir(&packs_dir)
        .expect("the rule packs directory exists")
        .map(|entry| entry.expect("a readable directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    packs.sort();

    let out_dir = Path::new(&env::var("OUT_DIR").expect("cargo sets OUT_DIR")).to_path_buf();
    let mut source = String::from("pub(crate) const PACKS: &[&str] = &[\n");
    for pack in &packs {
        let name = pack.file_name().expect("a pack has a file name");
        writeln!(
            source,
            "    include_str!({:?}),",
            minify(pack, &out_dir.join(name))
        )
        .unwrap();
    }
    source.push_str("];\n");
    let core = minify(&rules.join("core.json"), &out_dir.join("core.json"));
    writeln!(
        source,
        "pub(crate) const CORE: &str = include_str!({core:?});"
    )
    .unwrap();

    fs::write(out_dir.join("rules.rs"), source).expect("OUT_DIR is writable");
}

/// Writes `source` without its whitespace to `target`, returning the path.
fn minify(source: &Path, target: &Path) -> String {
    let json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(source).expect("a readable rule file"))
            .unwrap_or_else(|error| panic!("{} is not valid JSON: {error}", source.display()));
    fs::write(target, json.to_string()).expect("OUT_DIR is writable");
    target.display().to_string()
}
