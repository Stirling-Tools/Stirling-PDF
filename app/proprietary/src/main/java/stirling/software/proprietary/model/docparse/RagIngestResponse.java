package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * Engine response for {@code POST /api/v1/docparse/rag-ingest}. {@code markdown} and {@code chunks}
 * are only present when the request asked for them via includeMarkdown/includeChunks.
 */
public record RagIngestResponse(
        DocparseTier mode,
        String documentId,
        int chunksIndexed,
        int pages,
        String markdown,
        List<DocChunk> chunks) {}
