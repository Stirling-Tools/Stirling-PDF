package stirling.software.proprietary.policy.output;

import java.util.List;

/** One line of a rag-ingest corpus export. */
public record CorpusChunk(
        String documentId,
        int index,
        String text,
        Integer pageStart,
        Integer pageEnd,
        List<String> headingPath) {
    public CorpusChunk {
        if (documentId == null
                || documentId.isBlank()
                || index < 0
                || text == null
                || text.isBlank()) {
            throw new IllegalArgumentException(
                    "Corpus chunks require a document ID, nonnegative index and text");
        }
        headingPath = headingPath == null ? List.of() : List.copyOf(headingPath);
    }
}
