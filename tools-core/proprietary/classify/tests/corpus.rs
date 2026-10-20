//! Accuracy over the labelled corpus shared with the TypeScript heuristic's
//! test. Reports every miss rather than stopping at the first, so a rule
//! change shows everything it broke.

use std::collections::BTreeMap;
use std::path::Path;

use classify::{Confidence, Features, classify};
use serde::Deserialize;

// Hazard: shared with heuristicEngine.corpus.test.ts, which reads the same file.
const CORPUS: &str =
    "../../../frontend/editor/src/proprietary/services/heuristic/fixtures/corpus.json";

#[derive(Deserialize)]
struct Case {
    /// The expected top label; empty for a document that must stay unlabelled.
    expect: String,
    file: String,
    pages: Option<usize>,
    /// Replace spaces with no-break spaces, as some text layers do.
    #[serde(default)]
    nbsp: bool,
    #[serde(default)]
    meta: BTreeMap<String, String>,
    title: String,
    body: Vec<String>,
}

impl Case {
    fn features(&self) -> Features {
        let spaces = |text: &str| {
            if self.nbsp {
                text.replace(' ', "\u{00A0}")
            } else {
                text.to_owned()
            }
        };
        let body = spaces(&self.body.join("\n"));
        Features {
            file_name: self.file.clone(),
            page_count: self.pages.unwrap_or(1),
            metadata: self.meta.clone(),
            title: spaces(&self.title),
            first_page: body.clone(),
            body,
        }
    }
}

#[test]
fn classifies_the_corpus() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(CORPUS);
    let cases: Vec<Case> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();

    let mut misses = Vec::new();
    let mut confidence: BTreeMap<String, usize> = BTreeMap::new();
    for case in &cases {
        let verdict = classify(&case.features());
        let top = verdict.labels.first().map_or("", String::as_str);
        *confidence
            .entry(format!("{:?}", verdict.confidence))
            .or_default() += 1;
        if top != case.expect {
            misses.push(format!(
                "{}: expected {:?}, got {:?} ({:?}, p={}) candidates {:?}",
                case.file,
                case.expect,
                verdict.labels,
                verdict.confidence,
                verdict.probability,
                verdict
                    .candidates
                    .iter()
                    .map(|c| (&c.label, c.score))
                    .collect::<Vec<_>>()
            ));
        }
    }
    let accuracy = 1.0 - misses.len() as f64 / cases.len() as f64;
    println!(
        "{}/{} correct ({:.1}%), confidence {confidence:?}, {} rule patterns skipped",
        cases.len() - misses.len(),
        cases.len(),
        accuracy * 100.0,
        classify::skipped_patterns()
    );
    for miss in &misses {
        println!("  {miss}");
    }
    assert!(
        misses.is_empty(),
        "{} of {} cases misclassified",
        misses.len(),
        cases.len()
    );
}

#[test]
fn an_empty_document_has_no_labels() {
    let verdict = classify(&Features::default());
    assert_eq!(verdict.labels, Vec::<String>::new());
    assert_eq!(verdict.confidence, Confidence::None);
}
