package stirling.software.proprietary.model.docparse;

import java.util.List;

import stirling.software.proprietary.model.api.ai.AiPageText;

/** Engine request for {@code POST /api/v1/docparse/chunk}. */
public record ChunkDocumentRequest(
        String fileName,
        List<AiPageText> pages,
        String contentBase64,
        int chunkSize,
        int overlap,
        DocparseMode mode) {}
