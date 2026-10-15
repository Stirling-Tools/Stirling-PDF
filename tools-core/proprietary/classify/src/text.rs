//! Text normalisation and where a phrase may match.
//!
//! Phrases match on word boundaries, so "lease" does not fire inside "please"
//! or "nda" inside "agenda". Two relaxations keep inflected and compound words
//! matching: a phrase whose last word is long may run into a suffix
//! ("invoice" in "invoices"), and in languages that write compounds as one word
//! a phrase whose first word is long may close one ("vertrag" in
//! "mietvertrag"). Scripts written without spaces match anywhere.

use unicode_normalization::UnicodeNormalization;

/// A last word this long may take a suffix; shorter ones ("form", "act",
/// "will") would match too many unrelated words.
const SUFFIX_MIN_CHARS: usize = 5;
/// A first word this long may end a compound in a compounding language.
const COMPOUND_MIN_CHARS: usize = 6;
/// Languages whose packs write noun compounds as one word.
const COMPOUNDING_LANGUAGES: &[&str] = &["da", "de", "nl", "no", "sv"];

/// Lowercase, accents and ligatures folded, curly apostrophes straightened,
/// every run of whitespace one space.
pub(crate) fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_space = false;
    for c in text.chars().flat_map(char::to_lowercase) {
        if c.is_whitespace() {
            if !in_space && !out.is_empty() {
                out.push(' ');
            }
            in_space = true;
            continue;
        }
        in_space = false;
        match c {
            '\u{2018}' | '\u{2019}' => out.push('\''),
            '\u{FB01}' => out.push_str("fi"),
            '\u{FB02}' => out.push_str("fl"),
            _ => push_folded(&mut out, c),
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

fn push_folded(out: &mut String, c: char) {
    let replacement = match c {
        'ß' => "ss",
        'æ' => "ae",
        'œ' => "oe",
        'ø' => "o",
        'ł' => "l",
        'đ' | 'ð' => "d",
        'ı' => "i",
        'þ' => "th",
        _ => {
            // Latin combining marks only: other scripts' marks change the letter.
            out.extend(
                std::iter::once(c)
                    .nfd()
                    .filter(|m| !('\u{0300}'..='\u{036F}').contains(m)),
            );
            return;
        }
    };
    out.push_str(replacement);
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric()
}

/// Scripts that do not separate words with spaces, where a boundary means
/// nothing.
fn is_unspaced_script(c: char) -> bool {
    matches!(c,
        '\u{0E00}'..='\u{0EFF}'   // Thai, Lao
        | '\u{0F00}'..='\u{0FFF}' // Tibetan
        | '\u{1000}'..='\u{109F}' // Myanmar
        | '\u{1100}'..='\u{11FF}' // Hangul Jamo
        | '\u{1780}'..='\u{17FF}' // Khmer
        | '\u{3040}'..='\u{30FF}' // Hiragana, Katakana
        | '\u{3130}'..='\u{318F}' // Hangul compatibility Jamo
        | '\u{31F0}'..='\u{31FF}' // Katakana extensions
        | '\u{3400}'..='\u{4DBF}' // CJK extension A
        | '\u{4E00}'..='\u{9FFF}' // CJK unified
        | '\u{AC00}'..='\u{D7AF}' // Hangul syllables
        | '\u{F900}'..='\u{FAFF}' // CJK compatibility
        | '\u{FF66}'..='\u{FF9F}' // Halfwidth Katakana
        | '\u{20000}'..='\u{2FFFF}'
    )
}

/// Which edges of a phrase occurrence must sit on a word boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct Edges {
    start: bool,
    end: bool,
}

impl Edges {
    /// `phrase` is normalised; `language` is the pack it came from.
    pub(crate) fn for_phrase(phrase: &str, language: &str) -> Self {
        if phrase.chars().any(is_unspaced_script) {
            return Self {
                start: false,
                end: false,
            };
        }
        let mut words = phrase.split(' ');
        let first = words.next().unwrap_or("");
        let last = phrase.rsplit(' ').next().unwrap_or("");
        let compounding = COMPOUNDING_LANGUAGES.contains(&language);
        Self {
            start: !(compounding && first.chars().count() >= COMPOUND_MIN_CHARS),
            end: last.chars().count() < SUFFIX_MIN_CHARS,
        }
    }

    /// Whether `haystack[start..end]`, an occurrence of a phrase, may count.
    pub(crate) fn allow(self, haystack: &str, start: usize, end: usize) -> bool {
        let phrase = &haystack[start..end];
        let before = haystack[..start].chars().next_back();
        let after = haystack[end..].chars().next();
        let starts_word = phrase.chars().next().is_some_and(is_word_char);
        let ends_word = phrase.chars().next_back().is_some_and(is_word_char);
        let clear = |neighbour: Option<char>| !neighbour.is_some_and(is_word_char);
        (!self.start || !starts_word || clear(before)) && (!self.end || !ends_word || clear(after))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(phrase: &str, language: &str, haystack: &str) -> bool {
        let edges = Edges::for_phrase(phrase, language);
        haystack
            .match_indices(phrase)
            .any(|(start, found)| edges.allow(haystack, start, start + found.len()))
    }

    #[test]
    fn normalises_case_accents_and_spacing() {
        assert_eq!(
            normalize("  Straße \u{00A0}Für\tDie ﬁrma’s  "),
            "strasse fur die firma's"
        );
    }

    #[test]
    fn keeps_marks_that_are_part_of_other_scripts() {
        assert_eq!(normalize("हिन्दी"), "हिन्दी");
    }

    #[test]
    fn short_words_need_both_boundaries() {
        assert!(!matches("lease", "en", "please sign"));
        assert!(!matches("nda", "en", "the agenda"));
        assert!(!matches("form", "en", "format the file"));
        assert!(matches("lease", "en", "the lease ends"));
    }

    #[test]
    fn long_last_words_may_take_a_suffix() {
        assert!(matches("invoice", "en", "all invoices attached"));
        assert!(matches("tax invoice", "en", "tax invoices"));
        assert!(!matches("bill to", "en", "bill total"));
    }

    #[test]
    fn compounding_languages_match_inside_compounds() {
        assert!(matches("vertrag", "de", "der mietvertrag"));
        assert!(!matches("vertrag", "en", "der mietvertrag"));
    }

    #[test]
    fn unspaced_scripts_match_anywhere() {
        assert!(matches("請求書", "ja", "これは請求書です"));
    }
}
