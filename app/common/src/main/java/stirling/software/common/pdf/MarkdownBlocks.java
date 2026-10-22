package stirling.software.common.pdf;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Document-wide passes over a block list: joining, heading-level rebasing, heading paths. */
public final class MarkdownBlocks {

    private MarkdownBlocks() {}

    /** Separator between blocks; it ends in a newline, so every block starts at a line start. */
    public static final String SEPARATOR = "\n\n";

    /** A Markdown ATX heading at the start of a line, with its level in group 1. */
    private static final Pattern ATX_HEADING = Pattern.compile("(?m)^(#{1,6}) (?=\\S)");

    /** The same heading shape anchored at a block's own first character. */
    private static final Pattern BLOCK_HEADING = Pattern.compile("^(#{1,6}) (?=\\S)");

    /** Every character escapeMarkdown may have backslash-escaped, so unescaping is exact. */
    private static final String ESCAPABLE = "\\`*_[]<>|~#-+.)";

    /** Opening marker of the placeholder both converters emit in place of an image's bytes. */
    public static final String IMAGE_PLACEHOLDER = "<image redacted";

    public static String join(List<MarkdownBlock> blocks) {
        List<String> parts = new ArrayList<>(blocks.size());
        for (MarkdownBlock block : blocks) {
            parts.add(block.markdown());
        }
        return String.join(SEPARATOR, parts);
    }

    /**
     * Rebases headings so the strongest is level 1 and no level is skipped: levels only mean
     * anything against the other headings in the same document. The set is collected over the whole
     * list, so the decision is made once and then applied block by block.
     */
    public static List<MarkdownBlock> normaliseHeadingLevels(List<MarkdownBlock> blocks) {
        Set<Integer> levels = new TreeSet<>();
        for (MarkdownBlock block : blocks) {
            Matcher m = ATX_HEADING.matcher(block.markdown());
            while (m.find()) {
                levels.add(m.group(1).length());
            }
        }
        if (levels.isEmpty() || (levels.contains(1) && levels.size() == maxOf(levels))) {
            return blocks;
        }
        Map<Integer, String> rebased = rebaseMap(levels);
        List<MarkdownBlock> out = new ArrayList<>(blocks.size());
        for (MarkdownBlock block : blocks) {
            out.add(
                    block.withMarkdown(
                            ATX_HEADING
                                    .matcher(block.markdown())
                                    .replaceAll(r -> rebased.get(r.group(1).length()) + " ")));
        }
        return out;
    }

    /** Each block's enclosing heading chain; a heading block includes itself. */
    public static List<MarkdownBlock> withHeadingPaths(List<MarkdownBlock> blocks) {
        Deque<Heading> open = new ArrayDeque<>();
        List<MarkdownBlock> out = new ArrayList<>(blocks.size());
        for (MarkdownBlock block : blocks) {
            int level = headingLevel(block.markdown());
            if (level > 0) {
                while (!open.isEmpty() && open.peekLast().level() >= level) {
                    open.removeLast();
                }
                open.addLast(new Heading(level, headingText(block.markdown(), level)));
            }
            List<String> path = new ArrayList<>(open.size());
            for (Heading h : open) {
                path.add(h.text());
            }
            out.add(block.withHeadingPath(List.copyOf(path)));
        }
        return out;
    }

    /** ATX level of a block's own first line, or 0 when the block is not a heading. */
    public static int headingLevel(String markdown) {
        Matcher m = BLOCK_HEADING.matcher(markdown);
        return m.lookingAt() ? m.group(1).length() : 0;
    }

    /** True when a block is nothing but an image placeholder, so it carries no readable text. */
    public static boolean isImagePlaceholder(String markdown) {
        return markdown.strip().startsWith(IMAGE_PLACEHOLDER);
    }

    /** Reverses escapeMarkdown so a heading path reads as the page does. */
    public static String unescape(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\\' && i + 1 < text.length() && ESCAPABLE.indexOf(text.charAt(i + 1)) >= 0) {
                continue;
            }
            sb.append(c);
        }
        return sb.toString();
    }

    private static String headingText(String markdown, int level) {
        return unescape(markdown.substring(level + 1)).strip();
    }

    private static Map<Integer, String> rebaseMap(Set<Integer> levels) {
        Map<Integer, String> rebased = new HashMap<>();
        int rank = 1;
        for (int level : levels) {
            rebased.put(level, "#".repeat(rank++));
        }
        return rebased;
    }

    private static int maxOf(Set<Integer> levels) {
        int max = 0;
        for (int level : levels) {
            max = Math.max(max, level);
        }
        return max;
    }

    private record Heading(int level, String text) {}
}
