package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ChunkDocumentApiRequest extends PDFFile {

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
}
