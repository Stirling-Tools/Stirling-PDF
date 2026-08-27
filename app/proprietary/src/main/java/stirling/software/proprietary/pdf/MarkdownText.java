package stirling.software.proprietary.pdf;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Markdown text utilities: escaping extracted text, repairing extractor artefacts, and rebasing the
 * finished document's heading levels.
 */
final class MarkdownText {

    private MarkdownText() {}

    private static final Pattern SOFT_HYPHEN = Pattern.compile("(\\w+)-\\n([a-z])");

    /** A Markdown ATX heading at the start of a line, with its level in group 1. */
    private static final Pattern ATX_HEADING = Pattern.compile("(?m)^(#{1,6}) (?=\\S)");

    /**
     * Rebases headings so the strongest is level 1 and no level is skipped: levels only mean
     * anything against the other headings in the same document.
     */
    static String normaliseHeadingLevels(String markdown) {
        Set<Integer> levels = new TreeSet<>();
        Matcher m = ATX_HEADING.matcher(markdown);
        while (m.find()) {
            levels.add(m.group(1).length());
        }
        if (levels.isEmpty() || (levels.contains(1) && levels.size() == maxOf(levels))) {
            return markdown;
        }
        Map<Integer, String> rebased = new HashMap<>();
        int rank = 1;
        for (int level : levels) {
            rebased.put(level, "#".repeat(rank++));
        }
        return m.reset().replaceAll(r -> rebased.get(r.group(1).length()) + " ");
    }

    private static int maxOf(Set<Integer> levels) {
        int max = 0;
        for (int level : levels) {
            max = Math.max(max, level);
        }
        return max;
    }

    static int wordCount(String text) {
        return text.isBlank() ? 0 : text.strip().split("\\s+").length;
    }

    /**
     * Escapes Markdown control characters so extracted text is emitted literally. Output is still
     * untrusted: this is defence-in-depth, not safe rendering.
     */
    static String escapeMarkdown(String text) {
        if (text.isEmpty()) {
            return text;
        }
        String inline = escapeMarkdownInline(text);
        return escapeLeadingBlockMarker(inline, text);
    }

    /** Escapes inline-significant Markdown characters anywhere in the string. */
    static String escapeMarkdownInline(String text) {
        StringBuilder sb = new StringBuilder(text.length() + 8);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '\\', '`', '*', '_', '[', ']', '<', '>', '|', '~' -> sb.append('\\').append(c);
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    /**
     * Escapes markers significant only at line start: {@code #}, {@code -}, {@code +} and
     * ordered-list numbers. {@code original} is unescaped, so positions line up.
     */
    private static String escapeLeadingBlockMarker(String escaped, String original) {
        char c0 = original.charAt(0);
        if (c0 == '#' || c0 == '-' || c0 == '+') {
            return "\\" + escaped;
        }
        int i = 0;
        while (i < original.length() && Character.isDigit(original.charAt(i))) {
            i++;
        }
        if (i > 0 && i < original.length()) {
            char delim = original.charAt(i);
            if (delim == '.' || delim == ')') {
                return escaped.substring(0, i) + "\\" + escaped.substring(i);
            }
        }
        return escaped;
    }

    static String normaliseSpace(String s) {
        return s.strip().replaceAll("\\s+", " ");
    }

    static void flushParagraph(StringBuilder para, List<String> out) {
        if (!para.isEmpty()) {
            out.add(escapeMarkdown(para.toString()));
            para.setLength(0);
        }
    }

    static String repairHyphens(String text) {
        return SOFT_HYPHEN.matcher(text).replaceAll("$1$2");
    }

    static boolean endsWithSentencePunctuation(String s) {
        if (s.isEmpty()) {
            return false;
        }
        char last = s.charAt(s.length() - 1);
        return last == '.' || last == '?' || last == '!' || last == ':';
    }
}
