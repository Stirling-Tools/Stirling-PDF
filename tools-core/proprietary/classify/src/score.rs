//! Turning features into a verdict.
//!
//! A rule's evidence is its weight, scaled by where it hit (a title says more
//! than the body) and, with diminishing returns, how often. A label's score is
//! its evidence less its negative evidence, scaled by how well the page count
//! suits it.
//!
//! Confidence is a softmax over the scores with a "none of these" class pinned
//! at [`FLOOR`]: a winner far above both its rivals and the floor is likely; a
//! close race or a weak winner is not. One probability, from one temperature,
//! instead of separate hand-tuned bars for score, margin and runner-up.

use std::collections::HashMap;

use regex::Regex;

use crate::rules::{Label, NegativeRule, RuleSet, Zone, rules};
use crate::signals::{self, Strengths};
use crate::text::{Edges, normalize};
use crate::{Candidate, Confidence, Features, Verdict};

/// Below this score the best label is no better than "none of these".
const FLOOR: f64 = 18.0;
/// Score points per factor of e in the softmax: larger is more cautious.
const TEMPERATURE: f64 = 8.0;
const HIGH_PROBABILITY: f64 = 0.75;
const MEDIUM_PROBABILITY: f64 = 0.5;
/// A high verdict needs independent rules agreeing, not one strong hit.
const HIGH_MIN_RULES: usize = 2;
const SECONDARY_FLOOR: f64 = 28.0;
const SECONDARY_SHARE_OF_TOP: f64 = 0.5;
const SECONDARY_MIN_RULES: usize = 2;
const MAX_LABELS: usize = 5;
/// A rule written for one zone still counts elsewhere, for less.
const OFF_ZONE: f64 = 0.75;
const NEGATIVE_MAX_REPEATS: usize = 3;
/// A floor on the page-count prior, so a long invoice is not ruled out.
const PRIOR_FLOOR: f64 = 0.3;
const CANDIDATES: usize = 5;
const EVIDENCE_PER_CANDIDATE: usize = 8;

fn zone_weight(zone: Zone) -> f64 {
    match zone {
        Zone::Title => 2.0,
        Zone::FirstPage => 1.35,
        Zone::Body => 1.0,
    }
}

fn zone_name(zone: Zone) -> &'static str {
    match zone {
        Zone::Title => "title",
        Zone::FirstPage => "first page",
        Zone::Body => "body",
    }
}

/// 1 for one hit, rising slowly to 2.25 at twelve or more.
fn repetition(count: usize) -> f64 {
    if count == 0 {
        return 0.0;
    }
    1.0 + 0.35 * (count.min(12) as f64).log2()
}

/// One zone's text, raw for regexes and normalised for phrases, with every
/// phrase occurrence found in a single automaton pass.
struct ZoneText<'f> {
    zone: Zone,
    raw: &'f str,
    normalized: String,
    occurrences: HashMap<usize, Vec<(usize, usize)>>,
}

impl<'f> ZoneText<'f> {
    fn new(zone: Zone, raw: &'f str, rules: &RuleSet) -> Self {
        let normalized = normalize(raw);
        let mut occurrences: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
        for found in rules.phrases.find_overlapping_iter(&normalized) {
            occurrences
                .entry(found.pattern().as_usize())
                .or_default()
                .push((found.start(), found.end()));
        }
        Self {
            zone,
            raw,
            normalized,
            occurrences,
        }
    }

    fn phrase_count(&self, pattern: usize, edges: Edges) -> usize {
        self.occurrences.get(&pattern).map_or(0, |found| {
            found
                .iter()
                .filter(|&&(start, end)| edges.allow(&self.normalized, start, end))
                .count()
        })
    }

    fn regex_count(&self, regex: &Regex) -> usize {
        regex.find_iter(self.raw).count()
    }
}

struct Scored<'r> {
    label: &'r crate::rules::Label,
    score: f64,
    /// Positive rules that hit; structural signals are not counted.
    rules_hit: usize,
    evidence: Vec<String>,
}

pub(crate) fn score(features: &Features) -> Verdict {
    let rules = rules();
    let zones = [
        ZoneText::new(Zone::Title, &features.title, rules),
        ZoneText::new(Zone::FirstPage, &features.first_page, rules),
        ZoneText::new(Zone::Body, &features.body, rules),
    ];
    let context = Context {
        zones: &zones,
        file_name: features.file_name.to_lowercase(),
        metadata: &features.metadata,
        all_metadata: features
            .metadata
            .values()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n"),
        strengths: signals::measure(features, &rules.signal_patterns),
        page_count: features.page_count,
    };

    let mut scored: Vec<Scored> = rules
        .labels
        .iter()
        .filter_map(|label| context.score(label))
        .collect();
    scored.sort_by(|a, b| b.score.total_cmp(&a.score));
    verdict(&scored)
}

struct Context<'f, 'z> {
    zones: &'z [ZoneText<'f>; 3],
    file_name: String,
    metadata: &'f std::collections::BTreeMap<String, String>,
    all_metadata: String,
    strengths: Strengths,
    page_count: usize,
}

impl Context<'_, '_> {
    fn score<'r>(&self, label: &'r Label) -> Option<Scored<'r>> {
        let mut score = 0.0;
        let mut rules_hit = 0;
        let mut evidence = Vec::new();

        for phrase in &label.phrases {
            let best = self.best_zone(phrase.zone, phrase.weight, |zone| {
                zone.phrase_count(phrase.pattern, phrase.edges)
            });
            if let Some((value, zone)) = best {
                score += value;
                rules_hit += 1;
                evidence.push(format!(
                    "phrase \"{}\" in {} +{:.1}",
                    phrase.text,
                    zone_name(zone),
                    value
                ));
            }
        }
        for rule in &label.regexes {
            let best = self.best_zone(rule.zone, rule.weight, |zone| zone.regex_count(&rule.regex));
            if let Some((value, zone)) = best {
                score += value;
                rules_hit += 1;
                evidence.push(format!(
                    "pattern /{}/ in {} +{:.1}",
                    rule.regex.as_str(),
                    zone_name(zone),
                    value
                ));
            }
        }
        for rule in &label.filenames {
            if rule.regex.is_match(&self.file_name) {
                score += rule.weight;
                rules_hit += 1;
                evidence.push(format!(
                    "file name /{}/ +{:.1}",
                    rule.regex.as_str(),
                    rule.weight
                ));
            }
        }
        for rule in &label.metadata {
            let value = match &rule.field {
                Some(field) => self.metadata.get(field).map_or("", String::as_str),
                None => self.all_metadata.as_str(),
            };
            if rule.regex.is_match(value) {
                score += rule.weight;
                rules_hit += 1;
                let field = rule.field.as_deref().unwrap_or("any field");
                evidence.push(format!(
                    "metadata {field} /{}/ +{:.1}",
                    rule.regex.as_str(),
                    rule.weight
                ));
            }
        }
        for &(signal, weight) in &label.structural {
            let value = weight * self.strengths.of(signal);
            if value > 0.0 {
                score += value;
                evidence.push(format!("layout {} +{value:.1}", signal.name()));
            }
        }
        let body = &self.zones[2];
        for negative in &label.negatives {
            let (count, weight, what) = match negative {
                NegativeRule::Phrase {
                    pattern,
                    text,
                    edges,
                    weight,
                } => (
                    body.phrase_count(*pattern, *edges),
                    *weight,
                    format!("\"{text}\""),
                ),
                NegativeRule::Pattern(rule) => (
                    body.regex_count(&rule.regex),
                    rule.weight,
                    format!("/{}/", rule.regex.as_str()),
                ),
            };
            if count > 0 {
                let value = weight * repetition(count.min(NEGATIVE_MAX_REPEATS));
                score -= value;
                evidence.push(format!("against {what} -{value:.1}"));
            }
        }

        if score <= 0.0 {
            return None;
        }
        let prior = self.prior(label);
        if prior < 1.0 {
            evidence.push(format!("page count {} x{prior:.2}", self.page_count));
        }
        Some(Scored {
            label,
            score: score * prior,
            rules_hit,
            evidence,
        })
    }

    /// The best value a rule earns across the zones it hit, and that zone.
    fn best_zone(
        &self,
        written_for: Option<Zone>,
        weight: f64,
        count: impl Fn(&ZoneText) -> usize,
    ) -> Option<(f64, Zone)> {
        self.zones
            .iter()
            .filter_map(|zone| {
                let hits = count(zone);
                (hits > 0).then(|| {
                    let placement = match written_for {
                        Some(intended) if intended != zone.zone => OFF_ZONE,
                        _ => 1.0,
                    };
                    (
                        weight * zone_weight(zone.zone) * placement * repetition(hits),
                        zone.zone,
                    )
                })
            })
            .max_by(|a, b| a.0.total_cmp(&b.0))
    }

    fn prior(&self, label: &Label) -> f64 {
        let (Some(prior), true) = (&label.prior, self.page_count > 0) else {
            return 1.0;
        };
        let pages = self.page_count as f64;
        match prior.max {
            Some(max) if pages > max => (max / pages).max(PRIOR_FLOOR),
            _ if pages < prior.min => (pages / prior.min).max(PRIOR_FLOOR),
            _ => 1.0,
        }
    }
}

fn verdict(scored: &[Scored]) -> Verdict {
    let candidates = scored
        .iter()
        .take(CANDIDATES)
        .map(|s| Candidate {
            label: s.label.id.clone(),
            score: round(s.score, 1),
            evidence: s
                .evidence
                .iter()
                .take(EVIDENCE_PER_CANDIDATE)
                .cloned()
                .collect(),
        })
        .collect();
    let Some(top) = scored.first().filter(|top| top.score >= FLOOR) else {
        return Verdict {
            labels: Vec::new(),
            confidence: Confidence::None,
            probability: 0.0,
            score: round(scored.first().map_or(0.0, |top| top.score), 1),
            candidates,
        };
    };

    let probability = top_probability(scored);
    let confidence = if probability >= HIGH_PROBABILITY && top.rules_hit >= HIGH_MIN_RULES {
        Confidence::High
    } else if probability >= MEDIUM_PROBABILITY {
        Confidence::Medium
    } else {
        Confidence::Low
    };
    Verdict {
        labels: labels(top, scored),
        confidence,
        probability: round(probability, 3),
        score: round(top.score, 1),
        candidates,
    }
}

/// The winner and any runners-up strong enough to be secondary labels; none
/// when the winner is a label that must not be emitted.
fn labels(top: &Scored, scored: &[Scored]) -> Vec<String> {
    if !top.label.emit {
        return Vec::new();
    }
    let secondary_bar = SECONDARY_FLOOR.max(top.score * SECONDARY_SHARE_OF_TOP);
    std::iter::once(top)
        .chain(scored[1..].iter().filter(|s| {
            s.label.emit && s.score >= secondary_bar && s.rules_hit >= SECONDARY_MIN_RULES
        }))
        .take(MAX_LABELS)
        .map(|s| s.label.id.clone())
        .collect()
}

/// The winner's share of a softmax over every label and the floor.
fn top_probability(scored: &[Scored]) -> f64 {
    let top = scored[0].score;
    let rivals: f64 = scored[1..]
        .iter()
        .map(|s| ((s.score - top) / TEMPERATURE).exp())
        .sum();
    let none = ((FLOOR - top) / TEMPERATURE).exp();
    1.0 / (1.0 + rivals + none)
}

fn round(value: f64, places: i32) -> f64 {
    let factor = 10f64.powi(places);
    (value * factor).round() / factor
}
