//! Rule-based document classification, run unchanged in the browser (wasm)
//! and on the server (native), so both give the same verdict for a file.
//!
//! [`extract`] reads a PDF's features through PDFium, [`classify`] scores them
//! against the rule packs, and [`record`] writes the verdict into the PDF
//! where the rest of the app looks for one. Rules are data, shared with the
//! TypeScript heuristic; see `rules` for how they are applied.

#![forbid(unsafe_code)]

mod extract;
mod rules;
mod score;
mod signals;
mod text;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use stirling_pdfium::{Document, Error};

pub use extract::extract;

/// The Info-dictionary entry a verdict is stored in. Hazard: the AI classify
/// step and the frontend's label reader use the same key and `labels` shape.
pub const METADATA_KEY: &str = "StirlingPDFClassification";

/// What a document is classified from.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Features {
    pub file_name: String,
    pub page_count: usize,
    /// Info-dictionary fields, keyed in lowercase (`title`, `producer`, ...).
    pub metadata: BTreeMap<String, String>,
    /// The large lines at the top of the first page.
    pub title: String,
    pub first_page: String,
    /// The first and last few pages.
    pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    /// Nothing scored above the floor; there are no labels.
    None,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Verdict {
    /// Label ids, the most likely first; at most five. Empty when no label
    /// cleared the floor, or the winner is one that must not be emitted.
    pub labels: Vec<String>,
    pub confidence: Confidence,
    /// The winner's share of a softmax over every label and "none of these".
    pub probability: f64,
    pub score: f64,
    /// The best-scoring labels and the evidence for each, for explaining a
    /// verdict.
    pub candidates: Vec<Candidate>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Candidate {
    pub label: String,
    pub score: f64,
    pub evidence: Vec<String>,
}

pub fn classify(features: &Features) -> Verdict {
    score::score(features)
}

/// Stores the verdict's labels and confidence under [`METADATA_KEY`].
pub fn record(document: &Document, verdict: &Verdict) -> Result<(), Error> {
    let stored = serde_json::json!({
        "labels": verdict.labels,
        "confidence": verdict.confidence,
        "classifier": "rules",
    });
    document.set_metadata(METADATA_KEY, &stored.to_string())
}

/// Rule patterns ignored because linear-time regex cannot compile them.
pub fn skipped_patterns() -> usize {
    rules::rules().skipped_patterns
}
