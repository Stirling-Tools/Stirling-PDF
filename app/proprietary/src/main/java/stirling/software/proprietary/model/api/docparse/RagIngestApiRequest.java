package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RagIngestApiRequest extends PDFFile {

    @Schema(
            description =
                    "Stable identifier for the ingested document; re-ingesting the same id replaces"
                            + " its chunks. Defaults to a content hash of the uploaded bytes.")
    private String documentId;

    @Schema(description = "Target chunk size in characters (64-32768)", defaultValue = "512")
    private int chunkSize = 512;

    @Schema(
            description = "Overlap between adjacent chunks in characters (0-4096)",
            defaultValue = "64")
    private int overlap = 64;

    @Schema(
            description = "Tier to use: 'auto' picks per document, or force 'basic'/'advanced'",
            allowableValues = {"auto", "basic", "advanced"},
            defaultValue = "auto")
    private String mode = "auto";

    @Schema(
            description = "Index the document into the built-in knowledge base",
            defaultValue = "true")
    private boolean index = true;

    @Schema(
            description =
                    "Also return the parsed document as a markdown file, for delivery to external"
                            + " systems (vector DBs, training corpora)",
            defaultValue = "false")
    private boolean exportMarkdown = false;

    @Schema(
            description =
                    "Also return the chunks as a JSONL file (one chunk per line with page span and"
                            + " heading breadcrumb), ready for external embedding or indexing",
            defaultValue = "false")
    private boolean exportChunksJsonl = false;
}
