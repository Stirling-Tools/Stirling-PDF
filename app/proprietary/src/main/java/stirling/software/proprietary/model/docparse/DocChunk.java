package stirling.software.proprietary.model.docparse;

import java.util.List;

/** One RAG chunk with page span and heading breadcrumb. Mirrors {@code docparse.py DocChunk}. */
public record DocChunk(
        int index, String text, Integer pageStart, Integer pageEnd, List<String> headingPath) {

    public DocChunk {
        headingPath = headingPath == null ? List.of() : headingPath;
    }
}
