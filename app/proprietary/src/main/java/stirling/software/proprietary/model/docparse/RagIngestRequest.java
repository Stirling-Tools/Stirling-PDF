package stirling.software.proprietary.model.docparse;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.model.api.ai.AiPageText;

/**
 * Engine request for {@code POST /api/v1/docparse/rag-ingest}. Owner semantics mirror {@code POST
 * /api/v1/documents}: {@code ownerId} is the tenant, {@code readPrincipals} the explicit readers,
 * and a null {@code expiresAt} keeps the ingested content until an explicit delete. {@code index}
 * false skips the store (export-only); {@code includeMarkdown}/{@code includeChunks} echo the
 * parsed content back so the caller can emit corpus files.
 */
public record RagIngestRequest(
        String fileName,
        String documentId,
        String source,
        String ownerId,
        List<String> readPrincipals,
        Instant expiresAt,
        List<AiPageText> pages,
        String contentBase64,
        int chunkSize,
        int overlap,
        DocparseMode mode,
        boolean index,
        boolean includeMarkdown,
        boolean includeChunks) {}
