package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * Engine response for {@code POST /api/v1/docparse/parse}; also produced by the Java basic tier.
 */
public record ParseDocumentResponse(
        DocparseTier mode,
        int pages,
        List<DocBlock> blocks,
        List<DocTable> tables,
        String markdown,
        boolean ocrApplied) {

    public ParseDocumentResponse {
        blocks = blocks == null ? List.of() : blocks;
        tables = tables == null ? List.of() : tables;
        markdown = markdown == null ? "" : markdown;
    }
}
