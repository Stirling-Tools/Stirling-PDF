package stirling.software.common.pdf;

import java.util.List;

/**
 * One rendered Markdown element with the pages it came from. Page numbers are 1-based and differ
 * only for content stitched across a page break.
 */
public record MarkdownBlock(String markdown, int pageStart, int pageEnd, List<String> headingPath) {

    public MarkdownBlock {
        headingPath = headingPath == null ? List.of() : List.copyOf(headingPath);
    }

    public MarkdownBlock(String markdown, int pageStart, int pageEnd) {
        this(markdown, pageStart, pageEnd, List.of());
    }

    public MarkdownBlock withMarkdown(String replacement) {
        return new MarkdownBlock(replacement, pageStart, pageEnd, headingPath);
    }

    public MarkdownBlock withHeadingPath(List<String> path) {
        return new MarkdownBlock(markdown, pageStart, pageEnd, path);
    }
}
