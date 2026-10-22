package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Everything the controller needs to build the report header and the export ZIP. */
public record IngestOutcome(
        String documentId,
        int chunksIndexed,
        List<DocChunk> chunks,
        String markdown,
        int pages,
        int sourcePages,
        boolean truncated) {}
