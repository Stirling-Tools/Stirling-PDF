package stirling.software.proprietary.model.docparse;

/** The ingest response plus the source page count and whether extraction hit a configured limit. */
public record IngestOutcome(RagIngestResponse response, int sourcePages, boolean truncated) {}
