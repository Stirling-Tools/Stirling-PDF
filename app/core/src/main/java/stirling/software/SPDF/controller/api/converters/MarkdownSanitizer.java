package stirling.software.SPDF.controller.api.converters;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.AbstractVisitor;
import org.commonmark.node.HtmlBlock;
import org.commonmark.node.HtmlInline;
import org.commonmark.node.Image;
import org.commonmark.node.Link;
import org.commonmark.node.LinkReferenceDefinition;
import org.commonmark.node.Node;
import org.commonmark.node.SourceSpan;
import org.commonmark.parser.IncludeSourceSpans;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.markdown.MarkdownRenderer;

import stirling.software.common.util.CustomHtmlSanitizer;

/**
 * Removes from Markdown every reference LibreOffice's Markdown importer would dereference.
 *
 * <p>That importer converts Markdown to HTML and hands the result to the Writer/Web importer, so it
 * fetches from image syntax — inline, titled, angle-bracketed, and all three reference forms — and
 * from raw HTML embedded in the document, and it resolves {@code file:} and relative destinations
 * against the staging directory as readily as it resolves {@code http}. Forcing the import filter
 * buys nothing here: the forced filter is the fetcher.
 *
 * <p>The rewrite runs over a parsed document rather than the text, because a scan cannot tell an
 * image destination from the identical text inside a fenced code block or a code span, and those
 * have to survive verbatim. What is written back, though, is the original text with the offending
 * spans spliced out, not the document re-rendered: re-rendering rewrites the whole file in
 * commonmark's own dialect, which escapes what its parser does not model — {@code - [x] } becomes
 * {@code - \[x\] } and stops being a task list — and would damage documents that carry no reference
 * to strip at all.
 */
final class MarkdownSanitizer {

    private static final List<Extension> EXTENSIONS = List.of(TablesExtension.create());

    private static final Parser PARSER =
            Parser.builder()
                    .extensions(EXTENSIONS)
                    .includeSourceSpans(IncludeSourceSpans.BLOCKS_AND_INLINES)
                    .build();

    private static final MarkdownRenderer RENDERER =
            MarkdownRenderer.builder().extensions(EXTENSIONS).build();

    /**
     * Inline HTML that carries no reference of its own. A tag outside this set is dropped rather
     * than sanitized: inline HTML arrives one tag at a time, so handing {@code <b>} to an HTML
     * sanitizer returns a balanced {@code <b></b>} and doubles the document's markup.
     */
    private static final Set<String> INERT_INLINE_TAGS =
            Set.of(
                    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "br", "code",
                    "small", "span", "cite", "q", "del", "ins", "mark", "kbd", "samp", "var",
                    "abbr", "wbr");

    private MarkdownSanitizer() {}

    static String sanitize(String markdown, CustomHtmlSanitizer htmlSanitizer) {
        Node document = PARSER.parse(markdown);
        ReferenceStripper stripper = new ReferenceStripper(htmlSanitizer);
        document.accept(stripper);
        List<Node> rewritten = stripper.rewritten();
        if (rewritten.isEmpty()) {
            return markdown;
        }
        String spliced = splice(markdown, rewritten);
        // A node the parser gave no position for cannot be spliced, and leaving it in place would
        // leave its reference in the file, so the whole document goes back through the renderer.
        return spliced == null ? RENDERER.render(document) : spliced;
    }

    private record Edit(int start, int end, String text) {}

    private static String splice(String markdown, List<Node> rewritten) {
        List<Edit> edits = new ArrayList<>();
        for (Node node : rewritten) {
            List<SourceSpan> spans = node.getSourceSpans();
            if (spans.isEmpty()) {
                return null;
            }
            String replacement = replacementFor(node);
            for (SourceSpan span : spans) {
                int start = span.getInputIndex();
                edits.add(new Edit(start, start + span.getLength(), replacement));
                // A node spanning several lines keeps what lies between its spans — the blockquote
                // markers or list indentation of the lines it sits on — and is written back onto
                // the first of them.
                replacement = "";
            }
        }
        edits.sort((left, right) -> Integer.compare(left.start(), right.start()));

        StringBuilder rewrite = new StringBuilder(markdown.length());
        int copied = 0;
        for (Edit edit : edits) {
            // Nesting, as in a link around an image: the outer node is visited first and its
            // replacement already carries the inner one, so the inner edit is dropped.
            if (edit.start() < copied) {
                continue;
            }
            rewrite.append(markdown, copied, edit.start()).append(edit.text());
            copied = edit.end();
        }
        return rewrite.append(markdown, copied, markdown.length()).toString();
    }

    private static String replacementFor(Node node) {
        if (node instanceof HtmlBlock block) {
            return block.getLiteral();
        }
        if (node instanceof HtmlInline inline) {
            return inline.getLiteral();
        }
        if (node instanceof LinkReferenceDefinition) {
            return "";
        }
        return RENDERER.render(node);
    }

    private static final class ReferenceStripper extends AbstractVisitor {

        private final CustomHtmlSanitizer htmlSanitizer;
        private final List<Node> rewritten = new ArrayList<>();

        private ReferenceStripper(CustomHtmlSanitizer htmlSanitizer) {
            this.htmlSanitizer = htmlSanitizer;
        }

        private List<Node> rewritten() {
            return rewritten;
        }

        @Override
        public void visit(Image image) {
            String embeddable = embeddable(image.getDestination());
            if (!embeddable.equals(image.getDestination())) {
                image.setDestination(embeddable);
                rewritten.add(image);
            }
            visitChildren(image);
        }

        @Override
        public void visit(Link link) {
            String navigable = navigable(link.getDestination());
            if (!navigable.equals(link.getDestination())) {
                link.setDestination(navigable);
                rewritten.add(link);
            }
            visitChildren(link);
        }

        @Override
        public void visit(LinkReferenceDefinition definition) {
            // Deleted whatever it points at, and whatever this parser thinks uses it: a definition
            // renders as nothing, so keeping one costs the document nothing, while leaving a
            // remote destination in the file would be reachable by any reference LibreOffice's own
            // parser resolves and this one did not.
            if (!embeddable(definition.getDestination()).equals(definition.getDestination())) {
                rewritten.add(definition);
            }
        }

        @Override
        public void visit(HtmlBlock block) {
            String sanitized = htmlSanitizer.sanitize(block.getLiteral());
            if (!sanitized.equals(block.getLiteral())) {
                block.setLiteral(sanitized);
                rewritten.add(block);
            }
        }

        @Override
        public void visit(HtmlInline inline) {
            if (!isInertInlineTag(inline.getLiteral())) {
                inline.setLiteral("");
                rewritten.add(inline);
            }
        }
    }

    /** A destination the importer may embed: one that names no document but this one. */
    private static String embeddable(String destination) {
        String scheme = scheme(destination);
        return scheme.startsWith("#") || scheme.startsWith("data:") ? destination : "";
    }

    /**
     * A destination the importer writes as a hyperlink. These are not dereferenced at import, but a
     * relative or {@code file:} one would carry the staging path into the produced PDF.
     */
    private static String navigable(String destination) {
        String scheme = scheme(destination);
        return scheme.startsWith("#")
                        || scheme.startsWith("http://")
                        || scheme.startsWith("https://")
                        || scheme.startsWith("mailto:")
                ? destination
                : "";
    }

    private static String scheme(String destination) {
        return destination == null ? "" : destination.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isInertInlineTag(String literal) {
        if (literal == null) {
            return false;
        }
        String tag = literal.trim();
        if (tag.length() < 3 || tag.charAt(0) != '<' || tag.charAt(tag.length() - 1) != '>') {
            return false;
        }
        String name = tag.substring(1, tag.length() - 1).trim();
        if (name.startsWith("/")) {
            name = name.substring(1).trim();
        }
        if (name.endsWith("/")) {
            name = name.substring(0, name.length() - 1).trim();
        }
        return INERT_INLINE_TAGS.contains(name.toLowerCase(Locale.ROOT));
    }
}
