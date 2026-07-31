package stirling.software.proprietary.model.docparse;

/** Engine request for {@code POST /api/v1/documents/ask}: grounded Q&A over the RAG store. */
public record RagAskRequest(String question, int topK) {}
