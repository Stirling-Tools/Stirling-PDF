//! Structural signals: what a document's layout says about it, independent of
//! its words. Each is a strength from 0 to 1 that a label's rule weights.
//! Language-specific cues (the words of a signature block, a contents page's
//! heading) come from the packs' `patterns` groups; the rest are shapes.

use std::collections::HashMap;
use std::sync::OnceLock;

use regex::Regex;

use crate::Features;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum Signal {
    CurrencyHeavy,
    NumberTable,
    FormLike,
    TableOfContents,
    SignatureBlock,
    ReferencesSection,
    ShortDocument,
    LongDocument,
    BulletHeavy,
    EmailHeaders,
    UrlHeavy,
    AddressBlock,
}

impl Signal {
    pub(crate) fn parse(name: &str) -> Option<Self> {
        Some(match name {
            "currency_heavy" => Self::CurrencyHeavy,
            "number_table" => Self::NumberTable,
            "form_like" => Self::FormLike,
            "toc" => Self::TableOfContents,
            "signature_block" => Self::SignatureBlock,
            "references_section" => Self::ReferencesSection,
            "short_doc" => Self::ShortDocument,
            "long_doc" => Self::LongDocument,
            "bullet_heavy" => Self::BulletHeavy,
            "email_headers" => Self::EmailHeaders,
            "url_heavy" => Self::UrlHeavy,
            "address_block" => Self::AddressBlock,
            _ => return None,
        })
    }

    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::CurrencyHeavy => "currency_heavy",
            Self::NumberTable => "number_table",
            Self::FormLike => "form_like",
            Self::TableOfContents => "toc",
            Self::SignatureBlock => "signature_block",
            Self::ReferencesSection => "references_section",
            Self::ShortDocument => "short_doc",
            Self::LongDocument => "long_doc",
            Self::BulletHeavy => "bullet_heavy",
            Self::EmailHeaders => "email_headers",
            Self::UrlHeavy => "url_heavy",
            Self::AddressBlock => "address_block",
        }
    }
}

/// Signatures sit at the end of a document; this much text is "the end".
const SIGNATURE_TAIL_CHARS: usize = 2500;
const REFERENCES_TAIL_CHARS: usize = 4000;

struct Shapes {
    numeric_token: Regex,
    underscores: Regex,
    checkbox: Regex,
    dot_leader: Regex,
    bullet: Regex,
    url: Regex,
    citation: Regex,
}

fn shapes() -> &'static Shapes {
    static SHAPES: OnceLock<Shapes> = OnceLock::new();
    SHAPES.get_or_init(|| {
        let regex = |pattern: &str| Regex::new(pattern).expect("a valid built-in pattern");
        Shapes {
            numeric_token: regex(r"^[\d$£€.,%-]*\d[\d$£€.,%-]*$"),
            underscores: regex(r"_{4,}"),
            checkbox: regex(r"[☐☑□■]\s"),
            dot_leader: regex(r"\.{5,}\s*\d+\s*$"),
            bullet: regex(r"^[•▪◦*-]\s+\S"),
            url: regex(r"(?i)https?://|www\."),
            citation: regex(r"\[\d{1,3}\]|\(\d{4}\)"),
        }
    })
}

pub(crate) struct Strengths {
    values: HashMap<Signal, f64>,
}

impl Strengths {
    pub(crate) fn of(&self, signal: Signal) -> f64 {
        self.values.get(&signal).copied().unwrap_or(0.0)
    }
}

pub(crate) fn measure(features: &Features, patterns: &HashMap<String, Vec<Regex>>) -> Strengths {
    let body = features.body.as_str();
    let shapes = shapes();
    let group = |name: &str| patterns.get(name).map(Vec::as_slice).unwrap_or_default();
    let any = |name: &str, text: &str| group(name).iter().any(|re| re.is_match(text));
    let count = |name: &str, text: &str| {
        group(name)
            .iter()
            .map(|re| re.find_iter(text).count())
            .sum::<usize>()
    };

    let lines: Vec<&str> = body
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let tokens: Vec<&str> = body.split_whitespace().collect();
    let numeric = tokens
        .iter()
        .filter(|t| shapes.numeric_token.is_match(t))
        .count();
    let form_lines = lines
        .iter()
        .filter(|l| {
            shapes.underscores.is_match(l) || shapes.checkbox.is_match(l) || any("form_label", l)
        })
        .count();
    let dot_leaders = lines
        .iter()
        .filter(|l| shapes.dot_leader.is_match(l))
        .count();
    let bullets = lines.iter().filter(|l| shapes.bullet.is_match(l)).count();
    let signature_tail = tail(body, SIGNATURE_TAIL_CHARS);
    let references_tail = tail(body, REFERENCES_TAIL_CHARS);
    let pages = features.page_count;

    let flag = |on: bool| if on { 1.0 } else { 0.0 };
    let values = HashMap::from([
        (
            Signal::CurrencyHeavy,
            (count("currency", body) as f64 / 8.0).min(1.0),
        ),
        (
            Signal::NumberTable,
            flag(numeric as f64 / tokens.len().max(1) as f64 >= 0.22),
        ),
        (
            Signal::FormLike,
            if form_lines >= 6 {
                1.0
            } else if form_lines >= 3 {
                0.5
            } else {
                0.0
            },
        ),
        (
            Signal::TableOfContents,
            flag(any("toc", body) || dot_leaders >= 5),
        ),
        (
            Signal::SignatureBlock,
            flag(any("signature", signature_tail) || any("signature_form", signature_tail)),
        ),
        (
            Signal::ReferencesSection,
            flag(any("references", references_tail) && shapes.citation.is_match(references_tail)),
        ),
        (Signal::ShortDocument, flag((1..=2).contains(&pages))),
        (Signal::LongDocument, flag(pages >= 40)),
        (
            Signal::BulletHeavy,
            if bullets >= 12 {
                1.0
            } else if bullets >= 6 {
                0.5
            } else {
                0.0
            },
        ),
        (
            Signal::EmailHeaders,
            flag(any("email_from", body) && any("email_subject", body)),
        ),
        (
            Signal::UrlHeavy,
            flag(shapes.url.find_iter(body).count() >= 6),
        ),
        (Signal::AddressBlock, flag(count("address", body) >= 2)),
    ]);
    Strengths { values }
}

/// The last `chars` characters of `text`.
fn tail(text: &str, chars: usize) -> &str {
    let skip = text.chars().count().saturating_sub(chars);
    text.char_indices()
        .nth(skip)
        .map_or(text, |(at, _)| &text[at..])
}
