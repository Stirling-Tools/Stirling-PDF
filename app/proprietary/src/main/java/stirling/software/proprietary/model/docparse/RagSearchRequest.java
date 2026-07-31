package stirling.software.proprietary.model.docparse;

/** Engine request for {@code POST /api/v1/documents/search}: semantic search over the RAG store. */
public record RagSearchRequest(String query, int topK) {}
