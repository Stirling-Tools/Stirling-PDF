//! The rule packs, prepared once: core.json's labels with every language
//! pack's rules merged in. Every pack applies to every document, so there is
//! no language detection to get wrong; word-boundary matching keeps one
//! language's phrases from firing inside another's words.

use std::collections::HashMap;
use std::sync::OnceLock;

use aho_corasick::AhoCorasick;
use regex::{Regex, RegexBuilder};
use serde::Deserialize;

use crate::signals::Signal;
use crate::text::{Edges, normalize};

include!(concat!(env!("OUT_DIR"), "/rules.rs"));

// Per-kind weight caps, guarding against a mistyped weight in the data.
const PHRASE_MAX: f64 = 40.0;
const REGEX_MAX: f64 = 30.0;
const FILENAME_MAX: f64 = 30.0;
const METADATA_MAX: f64 = 20.0;
const NEGATIVE_MAX: f64 = 30.0;
const STRUCTURAL_MAX: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Zone {
    Title,
    FirstPage,
    Body,
}

pub(crate) struct RuleSet {
    pub labels: Vec<Label>,
    /// Every distinct normalised phrase text, positive or negative.
    pub phrases: AhoCorasick,
    pub signal_patterns: HashMap<String, Vec<Regex>>,
    /// Rule patterns that could not compile (look-around, which linear-time
    /// regex does not support) and are ignored.
    pub skipped_patterns: usize,
}

pub(crate) struct Label {
    pub id: String,
    /// False for labels that only exist to stop a lookalike winning (a recipe
    /// is not an invoice): if one wins, the document gets no label.
    pub emit: bool,
    pub phrases: Vec<PhraseRule>,
    pub regexes: Vec<RegexRule>,
    pub filenames: Vec<WeightedRegex>,
    pub metadata: Vec<MetadataRule>,
    pub negatives: Vec<NegativeRule>,
    pub structural: Vec<(Signal, f64)>,
    pub prior: Option<PagePrior>,
}

pub(crate) struct PhraseRule {
    /// Index into [`RuleSet::phrases`].
    pub pattern: usize,
    pub text: String,
    pub edges: Edges,
    pub weight: f64,
    /// The zone the rule is written for; a hit elsewhere counts for less.
    pub zone: Option<Zone>,
}

pub(crate) struct RegexRule {
    pub regex: Regex,
    pub weight: f64,
    pub zone: Option<Zone>,
}

pub(crate) struct WeightedRegex {
    pub regex: Regex,
    pub weight: f64,
}

pub(crate) struct MetadataRule {
    /// `None` matches any field.
    pub field: Option<String>,
    pub regex: Regex,
    pub weight: f64,
}

pub(crate) enum NegativeRule {
    Phrase {
        pattern: usize,
        text: String,
        edges: Edges,
        weight: f64,
    },
    Pattern(WeightedRegex),
}

/// The page counts a label's documents usually have.
pub(crate) struct PagePrior {
    pub min: f64,
    pub max: Option<f64>,
}

#[derive(Deserialize)]
struct RawRules {
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    labels: Vec<RawLabel>,
    #[serde(default)]
    priors: HashMap<String, Vec<Option<f64>>>,
    #[serde(default)]
    patterns: HashMap<String, Vec<RawRule>>,
}

#[derive(Deserialize)]
struct RawLabel {
    id: String,
    #[serde(default)]
    emit: Option<bool>,
    #[serde(default)]
    phrases: Vec<RawRule>,
    #[serde(default)]
    regexes: Vec<RawRule>,
    #[serde(default)]
    filenames: Vec<RawRule>,
    #[serde(default)]
    metadata: Vec<RawRule>,
    #[serde(default)]
    negatives: Vec<RawRule>,
    #[serde(default)]
    structural: Vec<RawRule>,
}

#[derive(Deserialize)]
struct RawRule {
    text: Option<String>,
    pattern: Option<String>,
    #[serde(default)]
    weight: f64,
    #[serde(rename = "where")]
    zone: Option<String>,
    flags: Option<String>,
    field: Option<String>,
    signal: Option<String>,
}

/// The prepared rules, built on first use.
pub(crate) fn rules() -> &'static RuleSet {
    static RULES: OnceLock<RuleSet> = OnceLock::new();
    RULES.get_or_init(|| {
        let core: RawRules = serde_json::from_str(CORE).expect("core.json is valid");
        let packs: Vec<RawRules> = PACKS
            .iter()
            .map(|pack| serde_json::from_str(pack).expect("every rule pack is valid"))
            .collect();
        Builder::default().build(core, packs)
    })
}

#[derive(Default)]
struct Builder {
    phrase_texts: Vec<String>,
    phrase_index: HashMap<String, usize>,
    skipped_patterns: usize,
}

impl Builder {
    fn build(mut self, core: RawRules, packs: Vec<RawRules>) -> RuleSet {
        let mut labels: Vec<Label> = Vec::with_capacity(core.labels.len());
        let mut by_id: HashMap<String, usize> = HashMap::new();
        for raw in &core.labels {
            by_id.insert(raw.id.clone(), labels.len());
            let mut label = Label {
                id: raw.id.clone(),
                emit: raw.emit.unwrap_or(true),
                phrases: Vec::new(),
                regexes: Vec::new(),
                filenames: Vec::new(),
                metadata: Vec::new(),
                negatives: Vec::new(),
                structural: Vec::new(),
                prior: prior(core.priors.get(&raw.id)),
            };
            self.add_rules(&mut label, raw, "en");
            labels.push(label);
        }

        for pack in &packs {
            let language = pack.language.as_deref().unwrap_or("en");
            for raw in &pack.labels {
                // Packs only extend core's labels; an unknown id is a typo, not a new label.
                if let Some(&index) = by_id.get(&raw.id) {
                    self.add_rules(&mut labels[index], raw, language);
                }
            }
        }

        let mut signal_patterns: HashMap<String, Vec<Regex>> = HashMap::new();
        for source in std::iter::once(&core).chain(&packs) {
            for (group, rules) in &source.patterns {
                let compiled = rules.iter().filter_map(|rule| self.compile(rule));
                signal_patterns
                    .entry(group.clone())
                    .or_default()
                    .extend(compiled);
            }
        }

        RuleSet {
            labels,
            phrases: AhoCorasick::new(&self.phrase_texts).expect("phrases build an automaton"),
            signal_patterns,
            skipped_patterns: self.skipped_patterns,
        }
    }

    fn add_rules(&mut self, label: &mut Label, raw: &RawLabel, language: &str) {
        for rule in &raw.phrases {
            let text = rule
                .text
                .as_deref()
                .map(normalize)
                .filter(|t| !t.is_empty());
            let Some(text) = text.filter(|_| rule.weight > 0.0) else {
                continue;
            };
            let phrase = PhraseRule {
                pattern: self.phrase(&text),
                edges: Edges::for_phrase(&text, language),
                text,
                weight: rule.weight.min(PHRASE_MAX),
                zone: zone(rule),
            };
            add_unique(
                &mut label.phrases,
                phrase,
                |a, b| a.text == b.text && a.zone == b.zone,
                |r| r.weight,
            );
        }
        for rule in &raw.regexes {
            if let Some(regex) = self.compile(rule) {
                let rule = RegexRule {
                    regex,
                    weight: rule.weight.min(REGEX_MAX),
                    zone: zone(rule),
                };
                add_unique(
                    &mut label.regexes,
                    rule,
                    |a, b| a.regex.as_str() == b.regex.as_str() && a.zone == b.zone,
                    |r| r.weight,
                );
            }
        }
        for rule in &raw.filenames {
            if let Some(regex) = self.compile(rule) {
                let rule = WeightedRegex {
                    regex,
                    weight: rule.weight.min(FILENAME_MAX),
                };
                add_unique(
                    &mut label.filenames,
                    rule,
                    |a, b| a.regex.as_str() == b.regex.as_str(),
                    |r| r.weight,
                );
            }
        }
        for rule in &raw.metadata {
            if let Some(regex) = self.compile(rule) {
                let field = rule.field.clone().filter(|f| !f.is_empty() && f != "any");
                let rule = MetadataRule {
                    field,
                    regex,
                    weight: rule.weight.min(METADATA_MAX),
                };
                add_unique(
                    &mut label.metadata,
                    rule,
                    |a, b| a.field == b.field && a.regex.as_str() == b.regex.as_str(),
                    |r| r.weight,
                );
            }
        }
        for rule in &raw.negatives {
            let weight = rule.weight.abs().min(NEGATIVE_MAX);
            let text = rule
                .text
                .as_deref()
                .map(normalize)
                .filter(|t| !t.is_empty());
            let negative = if let Some(text) = text {
                NegativeRule::Phrase {
                    pattern: self.phrase(&text),
                    edges: Edges::for_phrase(&text, language),
                    text,
                    weight,
                }
            } else if let Some(regex) = self.compile(rule) {
                NegativeRule::Pattern(WeightedRegex { regex, weight })
            } else {
                continue;
            };
            add_unique(
                &mut label.negatives,
                negative,
                NegativeRule::same,
                NegativeRule::weight,
            );
        }
        for rule in &raw.structural {
            let signal = rule.signal.as_deref().and_then(Signal::parse);
            if let (Some(signal), true) = (signal, rule.weight > 0.0) {
                let rule = (signal, rule.weight.min(STRUCTURAL_MAX));
                add_unique(&mut label.structural, rule, |a, b| a.0 == b.0, |r| r.1);
            }
        }
    }

    fn phrase(&mut self, text: &str) -> usize {
        if let Some(&index) = self.phrase_index.get(text) {
            return index;
        }
        let index = self.phrase_texts.len();
        self.phrase_texts.push(text.to_owned());
        self.phrase_index.insert(text.to_owned(), index);
        index
    }

    /// The rule's pattern, case-insensitive unless its flags say otherwise;
    /// `None` (and counted) when it does not compile.
    fn compile(&mut self, rule: &RawRule) -> Option<Regex> {
        let pattern = rule.pattern.as_deref().filter(|p| !p.is_empty())?;
        let flags = rule
            .flags
            .as_deref()
            .filter(|f| !f.is_empty())
            .unwrap_or("gi");
        let compiled = RegexBuilder::new(pattern)
            .case_insensitive(flags.contains('i'))
            .multi_line(flags.contains('m'))
            .dot_matches_new_line(flags.contains('s'))
            .build();
        if compiled.is_err() {
            self.skipped_patterns += 1;
        }
        compiled.ok()
    }
}

/// Adds `rule`, or keeps the heavier of it and a rule it duplicates. Packs
/// share loanwords and cognates ("menu", "invoice"), and with every pack
/// applied a duplicate would otherwise count once per pack.
fn add_unique<T>(
    rules: &mut Vec<T>,
    rule: T,
    same: impl Fn(&T, &T) -> bool,
    weight: impl Fn(&T) -> f64,
) {
    match rules.iter_mut().find(|existing| same(existing, &rule)) {
        Some(existing) if weight(&rule) > weight(existing) => *existing = rule,
        Some(_) => {}
        None => rules.push(rule),
    }
}

impl NegativeRule {
    fn same(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Phrase { text: a, .. }, Self::Phrase { text: b, .. }) => a == b,
            (Self::Pattern(a), Self::Pattern(b)) => a.regex.as_str() == b.regex.as_str(),
            _ => false,
        }
    }

    fn weight(&self) -> f64 {
        match self {
            Self::Phrase { weight, .. } => *weight,
            Self::Pattern(rule) => rule.weight,
        }
    }
}

fn zone(rule: &RawRule) -> Option<Zone> {
    match rule.zone.as_deref() {
        Some("title") => Some(Zone::Title),
        Some("first") => Some(Zone::FirstPage),
        _ => None,
    }
}

/// `[min, max]` or `[min, null]`.
fn prior(range: Option<&Vec<Option<f64>>>) -> Option<PagePrior> {
    let range = range?;
    let min = range.first().copied().flatten()?;
    let max = range.get(1).copied().flatten();
    Some(PagePrior { min, max })
}
