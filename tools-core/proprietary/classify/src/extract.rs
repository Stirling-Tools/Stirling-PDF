//! Reading a PDF's features through PDFium. Both hosts use this, so the
//! browser and the server classify the same text, which two different
//! extractors (pdf.js, PDFBox) would not give them.

use std::collections::BTreeMap;

use stirling_pdfium::{Document, Error, Page, TextPage};

use crate::Features;

/// A document's type shows at its start and its end; this many pages of each.
const WINDOW_FIRST: usize = 5;
const WINDOW_LAST: usize = 2;
/// Per page, to bound the work on a page of dense tables.
const PAGE_CHARS: usize = 8000;
const TITLE_CHARS: usize = 400;
const TITLE_LINES: usize = 6;
/// A title line's text is at least this share of the largest on the page.
const TITLE_SIZE_SHARE: f64 = 0.72;
/// Title lines start above this share of the page height: its top 45%.
const TITLE_BASELINE_SHARE: f64 = 0.55;
/// When nothing sits in the top region, the title is sought in this many
/// opening lines instead.
const TITLE_FALLBACK_LINES: usize = 8;
/// Info-dictionary entries, keyed as the rules' metadata fields name them.
const METADATA: [(&str, &str); 6] = [
    ("title", "Title"),
    ("author", "Author"),
    ("subject", "Subject"),
    ("keywords", "Keywords"),
    ("creator", "Creator"),
    ("producer", "Producer"),
];

pub fn extract(document: &Document, file_name: &str) -> Result<Features, Error> {
    let page_count = document.page_count();
    let metadata: BTreeMap<String, String> = METADATA
        .iter()
        .filter_map(|&(field, tag)| {
            document
                .metadata(tag)
                .map(|value| (field.to_owned(), value))
        })
        .collect();

    let mut title = String::new();
    let mut first_page = String::new();
    let mut window = Vec::new();
    for index in window_pages(page_count) {
        let page = document.page(index)?;
        let text = page.text(index)?;
        let content = clean(&text.text(0, PAGE_CHARS)?);
        if index == 0 {
            title = title_of(&page, &text);
            first_page = content.clone();
        }
        if !content.is_empty() {
            window.push(content);
        }
    }

    Ok(Features {
        file_name: file_name.to_owned(),
        page_count,
        metadata,
        title,
        first_page,
        body: window.join("\n"),
    })
}

fn window_pages(page_count: usize) -> Vec<usize> {
    let first = 0..WINDOW_FIRST.min(page_count);
    let last = page_count.saturating_sub(WINDOW_LAST).max(first.end)..page_count;
    first.chain(last).collect()
}

/// PDFium's inferred line breaks are `\r\n`.
fn clean(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim()
        .to_owned()
}

struct Line {
    text: String,
    size: f64,
    /// The first character's baseline, in points from the page's bottom.
    baseline: Option<f64>,
}

/// The large lines near the top of the page, which on a first page are
/// usually the title.
fn title_of(page: &Page, text: &TextPage) -> String {
    let lines = lines(text);
    let top = page.height() as f64 * TITLE_BASELINE_SHARE;
    let near_top: Vec<&Line> = lines
        .iter()
        .filter(|line| line.baseline.is_some_and(|y| y > top))
        .collect();
    let pool = if near_top.is_empty() {
        lines.iter().take(TITLE_FALLBACK_LINES).collect()
    } else {
        near_top
    };
    let largest = pool.iter().map(|line| line.size).fold(0.0, f64::max);
    let title = pool
        .iter()
        .filter(|line| largest == 0.0 || line.size >= largest * TITLE_SIZE_SHARE)
        .take(TITLE_LINES)
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    title.chars().take(TITLE_CHARS).collect()
}

fn lines(text: &TextPage) -> Vec<Line> {
    let mut lines = Vec::new();
    let mut current = Line {
        text: String::new(),
        size: 0.0,
        baseline: None,
    };
    let mut flush = |line: &mut Line| {
        let finished = std::mem::replace(
            line,
            Line {
                text: String::new(),
                size: 0.0,
                baseline: None,
            },
        );
        let trimmed = finished.text.trim();
        if !trimmed.is_empty() {
            lines.push(Line {
                text: trimmed.to_owned(),
                ..finished
            });
        }
    };
    for index in 0..text.char_count().min(PAGE_CHARS) {
        match text.char_at(index) {
            Some('\n') => flush(&mut current),
            Some('\r') | None => {}
            Some(c) => {
                if current.baseline.is_none() && !c.is_whitespace() {
                    current.baseline = text.char_origin(index).map(|(_, y)| y);
                }
                current.size = current.size.max(text.font_size(index));
                current.text.push(c);
            }
        }
    }
    flush(&mut current);
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_is_the_first_five_and_last_two_pages() {
        assert_eq!(window_pages(0), Vec::<usize>::new());
        assert_eq!(window_pages(3), vec![0, 1, 2]);
        assert_eq!(window_pages(6), vec![0, 1, 2, 3, 4, 5]);
        assert_eq!(window_pages(20), vec![0, 1, 2, 3, 4, 18, 19]);
    }
}
