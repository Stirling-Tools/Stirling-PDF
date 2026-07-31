package stirling.software.proprietary.model.docparse;

/** Engine response for {@code GET /api/v1/documents/stats}: the RAG document store totals. */
public record DocumentStoreStats(
        String backend, long documents, long chunks, String embeddingModel) {}
