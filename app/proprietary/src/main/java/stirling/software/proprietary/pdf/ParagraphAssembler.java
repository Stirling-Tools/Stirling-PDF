package stirling.software.proprietary.pdf;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Turns a column's lines into rendered Markdown blocks: headings (including wrapped ones), bullets,
 * bold labels and paragraphs.
 *
 * <p>Contents lists are recognised first and then left alone. A contents entry carries the
 * typography of the section it points at without being that section, so promoting one on size or
 * weight emits a spurious heading for every line of the list.
 */
final class ParagraphAssembler {

    private ParagraphAssembler() {}

    static void assembleParagraphs(
            List<Line> lines,
            float medianSize,
            float medianHeight,
            String bodyFont,
            List<String> out,
            Set<String> tableRowTexts) {
        StringBuilder para = new StringBuilder();
        float prevBottomY = Float.MAX_VALUE;
        float prevHeight = 0f;
        boolean[] inContents = contentsRun(lines);

        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            String text = MarkdownText.repairHyphens(line.text).strip();
            if (text.isEmpty()) {
                continue;
            }
            if (tableRowTexts.contains(text)) {
                continue;
            }

            float blockTop = line.y + line.height;
            float gap = prevBottomY - blockTop;
            boolean paragraphBreak = prevHeight > 0f && gap > prevHeight * 0.8f;
            // A contents entry carries the typography of the section it points at without being
            // that section, so nothing on one is promoted or emphasised.
            boolean structural = inContents[i];

            // A field value is data, never a heading: its widget box is taller than a text line
            // and would otherwise be promoted purely on height.
            String prefix =
                    line.synthetic || structural
                            ? ""
                            : HeadingDetector.headingPrefix(
                                    line.detectText(),
                                    line.detectHeight(),
                                    line.words(),
                                    medianSize,
                                    medianHeight,
                                    bodyFont,
                                    prevHeight <= 0f || paragraphBreak);
            if (prefix.isEmpty() && !structural && contentsTitle(lines, inContents, i)) {
                // The line a contents list runs on from is its heading: a contents page is often
                // set in one face, leaving no size or weight to promote it on.
                prefix = "# ";
            }
            boolean isBullet = startsWithBullet(text);
            // A line that opens with a list marker is an item of a list, whatever it is set in.
            boolean isHeading = !prefix.isEmpty() && !isBullet;

            if (isHeading) {
                MarkdownText.flushParagraph(para, out);
                StringBuilder heading = new StringBuilder(MarkdownText.escapeMarkdown(text));
                int words = MarkdownText.wordCount(text);
                int j = i;
                int k = i + 1;
                while (k < lines.size() && words < MAX_WRAPPED_HEADING_WORDS) {
                    Line next = lines.get(k);
                    String nt = MarkdownText.repairHyphens(next.text).strip();
                    if (nt.isEmpty()) {
                        // An empty extractor record is not a break in the text; the vertical
                        // gap below decides whether the heading ended.
                        k++;
                        continue;
                    }
                    if (inContents[k] || tableRowTexts.contains(nt)) {
                        break;
                    }
                    if (!wrapsHeading(
                            lines.get(j), next, prefix, medianSize, medianHeight, bodyFont)) {
                        break;
                    }
                    heading.append(' ').append(MarkdownText.escapeMarkdown(nt));
                    words += MarkdownText.wordCount(nt);
                    j = k;
                    k++;
                }
                out.add(prefix + heading);
                if (j > i) {
                    i = j;
                    line = lines.get(j);
                }
            } else if (isBullet) {
                MarkdownText.flushParagraph(para, out);
                out.add(MarkdownText.escapeMarkdown(text));
            } else if (!line.synthetic
                    && !structural
                    && HeadingDetector.isBoldLabel(line.detectText(), line.words())) {
                // Bold but not large enough to be a heading → emphasise as bold, don't promote.
                MarkdownText.flushParagraph(para, out);
                out.add("**" + MarkdownText.escapeMarkdown(text) + "**");
            } else if (paragraphBreak) {
                MarkdownText.flushParagraph(para, out);
                para.append(text);
            } else {
                if (!para.isEmpty()) {
                    char fc = text.charAt(0);
                    boolean noSpace = fc == '\'' || fc == '’' || fc == '‘' || fc == '"';
                    if (!noSpace) {
                        para.append(' ');
                    }
                }
                para.append(text);
            }

            prevBottomY = line.y;
            prevHeight = line.height;
        }
        MarkdownText.flushParagraph(para, out);
    }

    /** Glyphs a document may set its list markers in beyond the three already recognised. */
    private static final String EXTRA_BULLETS = "‣⁃▶●○■□" + "◆⮚➢➣➤";

    private static boolean startsWithBullet(String text) {
        if (text.isEmpty()) {
            return false;
        }
        if (text.startsWith("•") || text.startsWith("▪") || text.startsWith("◦")) {
            return true;
        }
        return EXTRA_BULLETS.indexOf(text.charAt(0)) >= 0;
    }

    /** Longest a heading may grow to by absorbing its continuation lines, in words. */
    private static final int MAX_WRAPPED_HEADING_WORDS = 24;

    /** How far a continuation line's type size may differ from the line it continues. */
    private static final float WRAP_SIZE_TOLERANCE = 0.2f;

    /** A full stop that a further sentence follows: the shape of prose, not of a heading. */
    private static final Pattern SENTENCE_BREAK = Pattern.compile("[.!?]\\s+\\p{Lu}");

    /**
     * True when {@code next} continues a wrapped heading rather than starting a new one: each
     * visual line arrives separately, so an unjoined heading emits as several spurious ones.
     */
    private static boolean wrapsHeading(
            Line head,
            Line next,
            String prefix,
            float medianSize,
            float medianHeight,
            String bodyFont) {
        if (next.synthetic) {
            return false;
        }
        float height = head.detectHeight();
        if (height <= 0f) {
            return false;
        }
        // The next baseline down, not the next block. The same 0.8 the paragraph assembler uses,
        // so a heading absorbs exactly what the converter already calls one block.
        float gap = head.y - (next.y + next.height);
        if (gap > height * 0.8f || gap < -height * 0.5f) {
            return false;
        }
        float nextHeight = next.detectHeight();
        if (Math.abs(nextHeight - height) > WRAP_SIZE_TOLERANCE * Math.max(nextHeight, height)) {
            return false;
        }
        // Same column: an x-range that misses the heading's belongs to another block entirely.
        if (next.x >= head.x + head.width || head.x >= next.x + next.width) {
            return false;
        }
        // A heading does not run to a full stop and then start another sentence; the bold run-in
        // lead-in below it does, and nothing else tells the two apart.
        if (SENTENCE_BREAK.matcher(next.text).find()) {
            return false;
        }
        String nextPrefix =
                HeadingDetector.headingPrefix(
                        next.detectText(),
                        next.detectHeight(),
                        next.words(),
                        medianSize,
                        medianHeight,
                        bodyFont,
                        false);
        // Either the continuation is display type in its own right, or it is the bold remainder of
        // a run-in heading, which cannot be promoted on its own because no gap precedes it.
        return nextPrefix.equals(prefix)
                || (nextPrefix.isEmpty()
                        && HeadingDetector.isBoldLabel(next.detectText(), next.words()));
    }

    /** A leader run: the dots that carry the eye from a contents entry to its page number. */
    private static final Pattern LEADER = Pattern.compile("([.][ ]?){4,}|[.\u00b7]{3,}|\u2026{2,}");

    /** Entries this many lines long make a contents list rather than a coincidence. */
    private static final int MIN_CONTENTS_RUN = 3;

    /**
     * Marks the lines of a contents list: a run of titles joined to page numbers by leader dots,
     * which carry the typography of the sections they point at without being those sections.
     */
    private static boolean[] contentsRun(List<Line> lines) {
        boolean[] entry = new boolean[lines.size()];
        int run = 0;
        for (int i = 0; i < lines.size(); i++) {
            String t = lines.get(i).text;
            if (LEADER.matcher(t).find() && endsWithNumber(t)) {
                entry[i] = true;
                run++;
            } else {
                if (run < MIN_CONTENTS_RUN) {
                    clear(entry, i - run, i);
                }
                run = 0;
            }
        }
        if (run < MIN_CONTENTS_RUN) {
            clear(entry, lines.size() - run, lines.size());
        }
        return entry;
    }

    private static void clear(boolean[] flags, int from, int to) {
        for (int i = Math.max(0, from); i < to; i++) {
            flags[i] = false;
        }
    }

    private static boolean endsWithNumber(String text) {
        String t = text.strip();
        return !t.isEmpty() && Character.isDigit(t.charAt(t.length() - 1));
    }

    /** True for the short line a contents list runs on from: the list's own heading. */
    private static boolean contentsTitle(List<Line> lines, boolean[] inContents, int index) {
        if (index + 1 >= lines.size() || inContents[index] || !inContents[index + 1]) {
            return false;
        }
        String t = lines.get(index).text.strip();
        return !t.isEmpty() && t.split(" +").length <= 6 && !endsWithNumber(t);
    }
}
