package stirling.software.SPDF.controller.api.converters;

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
 * have to survive verbatim.
 */
final class MarkdownSanitizer {

    private static final List<Extension> EXTENSIONS = List.of(TablesExtension.create());

    private static final Parser PARSER = Parser.builder().extensions(EXTENSIONS).build();

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
        document.accept(new ReferenceStripper(htmlSanitizer));
        return RENDERER.render(document);
    }

    private static final class ReferenceStripper extends AbstractVisitor {

        private final CustomHtmlSanitizer htmlSanitizer;

        private ReferenceStripper(CustomHtmlSanitizer htmlSanitizer) {
            this.htmlSanitizer = htmlSanitizer;
        }

        @Override
        public void visit(Image image) {
            image.setDestination(embeddable(image.getDestination()));
            visitChildren(image);
        }

        @Override
        public void visit(Link link) {
            link.setDestination(navigable(link.getDestination()));
            visitChildren(link);
        }

        @Override
        public void visit(LinkReferenceDefinition definition) {
            // A reference image is resolved into its own Image node with the destination copied,
            // and rendered inline, so what is left here can only be reached as a link.
            definition.setDestination(navigable(definition.getDestination()));
        }

        @Override
        public void visit(HtmlBlock block) {
            block.setLiteral(htmlSanitizer.sanitize(block.getLiteral()));
        }

        @Override
        public void visit(HtmlInline inline) {
            inline.setLiteral(isInertInlineTag(inline.getLiteral()) ? inline.getLiteral() : "");
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
