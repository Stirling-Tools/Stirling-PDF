package stirling.software.proprietary.model.docparse;

import java.time.Instant;
import java.util.List;

import stirling.software.common.pdf.MarkdownBlock;

/**
 * Engine request for {@code POST /api/v1/docparse/ingest}. Java converts the PDF to page-attributed
 * Markdown blocks; the engine packs them into chunks, embeds and indexes them. Owner semantics
 * mirror {@code POST /api/v1/documents}: {@code ownerId} is the tenant, {@code readPrincipals} the
 * explicit readers, and a null {@code expiresAt} keeps the ingested content until an explicit
 * delete. {@code index} false skips the store (export-only); {@code includeChunks} returns the
 * chunks so the caller can emit a corpus file.
 */
public record IngestRequest(
        String documentId,
        String source,
        String ownerId,
        List<String> readPrincipals,
        Instant expiresAt,
        List<MarkdownBlock> blocks,
        int chunkSize,
        int overlap,
        boolean index,
        boolean includeChunks) {}
