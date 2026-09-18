package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * Engine response for {@code POST /api/v1/docparse/rag-ingest}. {@code chunks} is only present when
 * the request asked for it via includeChunks.
 */
public record RagIngestResponse(String documentId, int chunksIndexed, List<DocChunk> chunks) {}
