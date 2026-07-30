package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/chunk}. */
public record ChunkDocumentResponse(DocparseTier mode, List<DocChunk> chunks) {

    public ChunkDocumentResponse {
        chunks = chunks == null ? List.of() : chunks;
    }
}
