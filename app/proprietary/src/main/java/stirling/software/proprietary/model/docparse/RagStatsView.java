package stirling.software.proprietary.model.docparse;

/**
 * Merged RAG store view served by {@code GET /api/v1/docparse/rag-stats} (Java side): the engine's
 * document-store totals plus the cached DocParse capability fields. When the engine is unreachable
 * the totals are zero and {@code engineReachable} is false.
 */
public record RagStatsView(
        String backend,
        long documents,
        long chunks,
        String embeddingModel,
        boolean advancedInstalled,
        String doclingVersion,
        boolean engineReachable) {}
